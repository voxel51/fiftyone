import {
  fieldVisibilityStage,
  useActiveModalSample,
  useSampleFields,
  useTimeZone,
} from "@fiftyone/state";
import {
  DATE_TIME_FIELD,
  formatPrimitive,
  type Field,
} from "@fiftyone/utilities";
import { getNestedField } from "@fiftyone/utilities/src/sample/pointer";
import { Input, InputType, Size } from "@voxel51/voodo";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import styles from "./FieldsSidebar.module.css";

// Release-only workaround: `sampleFields` currently merges the Mongo schema
// with multimodal projection fields. Until FOEPD-4553 exposes the Mongo schema
// separately, keep paths rooted in multimodal projection grains out of this
// sample-document view.
const MULTIMODAL_PROJECTION_GRAINS = new Set([
  "events",
  "labels",
  "summaries",
  "signals",
]);

type SidebarField = Pick<Field, "dbField" | "description" | "ftype" | "path">;

interface FieldNode {
  readonly children: readonly FieldNode[];
  readonly field: SidebarField;
  readonly value: unknown;
}

const isMultimodalProjectionField = (path: string): boolean =>
  MULTIMODAL_PROJECTION_GRAINS.has(path.split(".", 1)[0]);

const hasPrivatePathSegment = (path: string): boolean =>
  path.split(".").some((segment) => segment.startsWith("_"));

const isHiddenPath = (
  path: string,
  hiddenPaths: ReadonlySet<string>,
): boolean => {
  for (const hiddenPath of hiddenPaths) {
    if (path === hiddenPath || path.startsWith(`${hiddenPath}.`)) {
      return true;
    }
  }
  return false;
};

const fieldName = (field: SidebarField): string =>
  field.path.split(".").at(-1) ?? field.path;

/**
 * The raw sample doc keys some fields by their Mongo `dbField` rather than
 * their schema path — most commonly `id` (schema path) / `_id` (actual key).
 * Only the field's own last path segment can differ this way (nested
 * embedded-document fields don't get renamed at the db level), so swapping
 * just that segment is enough.
 */
const resolveDbPath = (field: SidebarField): string => {
  if (!field.dbField) {
    return field.path;
  }
  const segments = field.path.split(".");
  segments[segments.length - 1] = field.dbField;
  return segments.join(".");
};

const isDateWrapper = (value: unknown): value is { datetime: number } =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as Record<string, unknown>).datetime === "number";

const displayObject = (value: unknown): Record<string, unknown> | undefined => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isDateWrapper(value)
  ) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const inferRuntimeFieldType = (value: unknown): string =>
  isDateWrapper(value) ? DATE_TIME_FIELD : "";

const buildValueNode = (
  field: SidebarField,
  value: unknown,
  fieldsByPath: ReadonlyMap<string, SidebarField>,
  hiddenPaths: ReadonlySet<string>,
): FieldNode => {
  const objectValue = displayObject(value);
  const children = objectValue
    ? Object.entries(objectValue).flatMap(([name, childValue]) => {
        const path = `${field.path}.${name}`;
        if (name.startsWith("_") || isHiddenPath(path, hiddenPaths)) {
          return [];
        }
        const childField = fieldsByPath.get(path) ?? {
          dbField: null,
          description: null,
          ftype: inferRuntimeFieldType(childValue),
          path,
        };
        return [
          buildValueNode(childField, childValue, fieldsByPath, hiddenPaths),
        ];
      })
    : [];
  return {
    children,
    field,
    value,
  };
};

const buildFieldTree = (
  sampleFields: readonly SidebarField[],
  sample: Record<string, unknown> | undefined,
  hiddenPaths: ReadonlySet<string>,
): readonly FieldNode[] => {
  const fieldsByPath = new Map<string, SidebarField>();
  for (const field of sampleFields) {
    if (field) {
      fieldsByPath.set(field.path, field);
    }
  }

  return sampleFields
    .filter(
      (field) =>
        field &&
        !field.path.includes(".") &&
        !hasPrivatePathSegment(field.path) &&
        !isMultimodalProjectionField(field.path) &&
        !isHiddenPath(field.path, hiddenPaths),
    )
    .map((field) =>
      buildValueNode(
        field,
        getNestedField(sample, resolveDbPath(field)),
        fieldsByPath,
        hiddenPaths,
      ),
    )
    .sort((left, right) => left.field.path.localeCompare(right.field.path));
};

type FormattedFieldValue =
  | { kind: "muted" | "summary"; text: string }
  | { kind: "text"; text: string };

const itemCount = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

const visibleObjectKeyCount = (value: Record<string, unknown>): number =>
  Object.keys(value).filter((key) => !key.startsWith("_")).length;

const collectionSummary = (
  value: unknown,
  fallbackFieldCount: number,
): string => {
  const objectValue = displayObject(value);
  return itemCount(
    objectValue ? visibleObjectKeyCount(objectValue) : fallbackFieldCount,
    "field",
  );
};

/** Formats primitive and compact-list values for the one-column inspector. */
const formatFieldValue = (
  value: unknown,
  ftype: string,
  timeZone: string,
): FormattedFieldValue => {
  if (value === null || value === undefined) {
    return { kind: "muted", text: "—" };
  }
  if (typeof value === "string" || typeof value === "number") {
    const formatted = formatPrimitive({
      ftype,
      timeZone,
      value: value as never,
    });
    return {
      kind: "text",
      text: formatted === null ? String(value) : String(formatted),
    };
  }
  if (typeof value === "boolean") {
    return { kind: "text", text: value ? "true" : "false" };
  }
  if (isDateWrapper(value)) {
    const formatted = formatPrimitive({ ftype, timeZone, value });
    if (formatted !== null) {
      return { kind: "text", text: String(formatted) };
    }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: "muted", text: "None" };
    }
    if (
      value.every(
        (item) =>
          item === null ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
    ) {
      return {
        kind: "text",
        text: value.map((item) => String(item)).join(", "),
      };
    }
    return { kind: "summary", text: itemCount(value.length, "item") };
  }
  const objectValue = displayObject(value);
  if (objectValue) {
    const count = visibleObjectKeyCount(objectValue);
    return count === 0
      ? { kind: "muted", text: "None" }
      : { kind: "summary", text: itemCount(count, "field") };
  }
  return { kind: "text", text: String(value) };
};

const searchablePrimitiveValue = (
  node: FieldNode,
  timeZone: string,
): string | undefined => {
  const primitiveList =
    Array.isArray(node.value) &&
    node.value.every(
      (item) =>
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );
  if (
    typeof node.value !== "string" &&
    typeof node.value !== "number" &&
    typeof node.value !== "boolean" &&
    !isDateWrapper(node.value) &&
    !primitiveList
  ) {
    return undefined;
  }
  return formatFieldValue(node.value, node.field.ftype, timeZone).text;
};

const filterFieldTree = (
  nodes: readonly FieldNode[],
  query: string,
  timeZone: string,
): readonly FieldNode[] => {
  if (!query) {
    return nodes;
  }

  const results: FieldNode[] = [];
  for (const node of nodes) {
    const primitiveValue = searchablePrimitiveValue(node, timeZone);
    const matches =
      node.field.path.toLocaleLowerCase().includes(query) ||
      node.field.description?.toLocaleLowerCase().includes(query) ||
      primitiveValue?.toLocaleLowerCase().includes(query);
    if (matches) {
      results.push(node);
      continue;
    }
    const children = filterFieldTree(node.children, query, timeZone);
    if (children.length > 0) {
      results.push({ ...node, children });
    }
  }
  return results;
};

const FieldNodeRow: React.FC<{
  readonly forceExpanded: boolean;
  readonly node: FieldNode;
  readonly timeZone: string;
}> = ({ forceExpanded, node, timeZone }) => {
  const path = node.field.path;
  const name = fieldName(node.field);
  const expandable = node.children.length > 0;

  if (expandable) {
    return (
      <details className={styles.fieldNode} open={forceExpanded || undefined}>
        <summary
          className={styles.groupHeader}
          onClick={(event) => {
            if (forceExpanded) {
              event.preventDefault();
            }
          }}
          title={path}
        >
          <span aria-hidden="true" className={styles.chevron} />
          <span className={styles.fieldLabel}>{name}</span>
          <span className={styles.groupSummary}>
            {collectionSummary(node.value, node.children.length)}
          </span>
        </summary>
        <div className={styles.children}>
          {node.field.description ? (
            <span className={styles.description}>{node.field.description}</span>
          ) : null}
          {node.children.map((child) => (
            <FieldNodeRow
              forceExpanded={forceExpanded}
              key={child.field.path}
              node={child}
              timeZone={timeZone}
            />
          ))}
        </div>
      </details>
    );
  }

  const formatted = formatFieldValue(node.value, node.field.ftype, timeZone);
  return (
    <div className={styles.fieldNode} title={path}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{name}</span>
        <span
          className={`${styles.fieldValue} ${
            formatted.kind === "text" ? "" : styles.mutedValue
          }`}
        >
          {formatted.text}
        </span>
        {node.field.description ? (
          <span className={styles.description}>{node.field.description}</span>
        ) : null}
      </div>
    </div>
  );
};

/** Current sample values, searchable and grouped by their schema hierarchy. */
const FieldsSidebar: React.FC = () => {
  const sampleFields = useSampleFields();
  const activeSample = useActiveModalSample();
  const timeZone = useTimeZone();
  const fvStage = useRecoilValue(fieldVisibilityStage);
  const [search, setSearch] = useState("");
  const hiddenPaths = useMemo(
    () => new Set<string>(fvStage?.kwargs?.field_names ?? []),
    [fvStage?.kwargs?.field_names],
  );
  const fieldTree = useMemo(
    () => buildFieldTree(sampleFields, activeSample, hiddenPaths),
    [activeSample, hiddenPaths, sampleFields],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleTree = useMemo(
    () => filterFieldTree(fieldTree, normalizedSearch, timeZone),
    [fieldTree, normalizedSearch, timeZone],
  );

  if (fieldTree.length === 0) {
    return (
      <span className={styles.emptyText} data-testid="episode-fields-empty">
        This dataset has no sample fields.
      </span>
    );
  }

  return (
    <div className={styles.root} data-testid="episode-fields-body">
      <div className={styles.searchBar}>
        <Input
          aria-label="Search fields"
          className={styles.searchInput}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search fields"
          size={Size.Sm}
          type={InputType.Search}
          value={search}
        />
      </div>
      {visibleTree.length > 0 ? (
        <div className={styles.fieldList}>
          {visibleTree.map((node) => (
            <FieldNodeRow
              forceExpanded={normalizedSearch.length > 0}
              key={node.field.path}
              node={node}
              timeZone={timeZone}
            />
          ))}
        </div>
      ) : (
        <span className={styles.emptyText}>
          No fields match &quot;{search}&quot;
        </span>
      )}
    </div>
  );
};

export default FieldsSidebar;
