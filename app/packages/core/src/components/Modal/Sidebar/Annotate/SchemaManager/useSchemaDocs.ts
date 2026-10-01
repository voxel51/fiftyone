/**
 * Named label-schema DOC access for the Schema Manager (the converged
 * design's one-editing-surface). Wraps the `@voxel51/label-schemas`
 * schema-doc operators with the same `operatorAsPromise` pattern the
 * dataset-level schema manager uses, and holds the manager's doc-mode
 * state: which doc is selected (null = classic dataset mode) and its
 * loaded body.
 *
 * The stage config picker only SELECTS docs; all editing — visibility
 * tiers and content — happens here in the Schema Manager.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useAtom, useSetAtom, type PrimitiveAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import {
  managerSchemaDoc,
  managerSchemaDocId,
  taskLabelSchemaDoc,
} from "../state";
import { operatorAsPromise, type Operator } from "../useSchemaManager";

/** The builtin plugin that owns label-schema documents (workflow-neutral). */
export const LABEL_SCHEMAS_PLUGIN = "@voxel51/label-schemas";
const PLUGIN_PREFIX = LABEL_SCHEMAS_PLUGIN;
/** Gate for "the schema-doc operators are registered" checks. */
export const LIST_LABEL_SCHEMA_DOCS_OPERATOR = `${PLUGIN_PREFIX}/list_label_schema_docs`;

/**
 * Required/default sample+frame fields the server cannot serialize
 * without — mirrored from `fiftyone.core.label_schema_docs.PROTECTED_PATHS`.
 * Never
 * hidden, in any schema.
 */
export const PROTECTED_PATHS = new Set([
  "id",
  "filepath",
  "tags",
  "metadata",
  "created_at",
  "last_modified_at",
  "frames",
  "frames.id",
  "frames.frame_number",
  "frames.created_at",
  "frames.last_modified_at",
]);

/**
 * Label attributes a schema can never hide (mirrors the server's
 * ``PROTECTED_ATTRIBUTES``): identity (``id``), tagging (``tags``),
 * instance linking (``index``) and geometry the renderer needs. A
 * stored ``hidden`` tier on one of these is ignored.
 */
export const PROTECTED_ATTRIBUTES = new Set([
  "id",
  "tags",
  "index",
  "mask",
  "mask_path",
  "points",
  "bounding_box",
]);

/** Whether a field's attribute is hidden under the doc. */
export const docAttributeHidden = (
  doc: Pick<SchemaDoc, "visibility"> | null | undefined,
  path: string,
  attribute: string,
): boolean =>
  !PROTECTED_ATTRIBUTES.has(attribute) &&
  doc?.visibility?.fields?.[path]?.attributes?.[attribute] === "hidden";

export interface SchemaDocSummary {
  id: string;
  name: string;
  description?: string;
  updated_at?: number;
  version?: number;
}

export interface SchemaDocContentAttribute {
  name: string;
  type?: string | null;
  read_only?: boolean;
  [key: string]: unknown;
}

export interface SchemaDocContentEntry {
  type?: string | null;
  classes?: string[];
  attributes?: SchemaDocContentAttribute[];
  bbox?: "editable" | "read_only";
  label?: "editable" | "read_only";
  read_only?: boolean;
  [key: string]: unknown;
}

export type SchemaDocTier = "annotate" | "explore" | "hidden";

export interface SchemaDocFieldVisibility {
  tier?: SchemaDocTier;
  /** Omitted attribute = "annotate". */
  attributes?: Record<string, SchemaDocTier>;
}

export interface SchemaDocVisibility {
  /** Tier for unlisted fields; omitted = "explore". */
  default?: "explore" | "hidden";
  fields: Record<string, SchemaDocFieldVisibility>;
}

export interface SchemaDoc {
  id: string;
  name: string;
  description?: string;
  version?: number;
  label_schema: Record<string, SchemaDocContentEntry>;
  visibility: SchemaDocVisibility;
}

type OkResponse = { ok: boolean; error?: string };
type ListResponse = OkResponse & { schemas?: SchemaDocSummary[] };
export interface ResolvedSchemaDoc {
  id?: string;
  name?: string;
  active?: string[];
  excluded_paths?: string[];
  excluded_attr_paths?: string[];
  excluded_attr_db_paths?: string[];
  label_schemas?: Record<string, unknown>;
}
type DocResponse = OkResponse & {
  schema?: SchemaDoc;
  resolved?: ResolvedSchemaDoc;
};

/**
 * Selected schema doc id; null = classic dataset-schema mode. Aliases
 * the canonical atoms in `Annotate/state.ts` — while a doc is open,
 * `effectiveLabelSchemasData` overlays its content so the whole
 * existing editing surface reads THIS schema.
 */
export const selectedSchemaDocId = managerSchemaDocId;

/** The selected doc's loaded body (kept fresh by `SchemaDocPanel`). */
export const loadedSchemaDoc =
  managerSchemaDoc as unknown as PrimitiveAtom<SchemaDoc | null>;

const fail = (res: OkResponse | undefined, verb: string): never => {
  throw new Error(res?.error ?? `Failed to ${verb} schema`);
};

export interface SchemaDocsApi {
  listDocs(): Promise<SchemaDocSummary[]>;
  getDoc(
    schemaId: string,
    includeResolved?: boolean,
  ): Promise<SchemaDoc & { resolved?: ResolvedSchemaDoc }>;
  createDoc(name: string, fromDataset: boolean): Promise<SchemaDoc>;
  /**
   * Partial update. Pass the loaded doc's `version` to make the save
   * conditional: the operator refuses to overwrite a newer version (a
   * second tab or user saved first) and the promise rejects.
   */
  updateDoc(
    schemaId: string,
    updates: Partial<
      Pick<SchemaDoc, "name" | "description" | "label_schema" | "visibility">
    > & { version?: number },
  ): Promise<SchemaDoc>;
  deleteDoc(schemaId: string): Promise<void>;
  /**
   * Fans a newly created dataset field out to every custom schema:
   * annotate-tier `entry` in `sourceSchemaId` (when given), explicit
   * hidden everywhere else. The dataset default is written by the
   * field creation itself.
   */
  propagateField(
    path: string,
    entry: SchemaDocContentEntry | null,
    sourceSchemaId: string | null,
  ): Promise<void>;
}

export const useSchemaDocs = (): SchemaDocsApi => {
  // ``useOperatorExecutor`` returns a new object identity per render;
  // capture the executors in a ref so the returned api is REFERENTIALLY
  // STABLE — effects keyed on it must not re-fire per render (that bug
  // reset the field-editor navigation on every click and refetched the
  // doc in a loop).
  const operatorsRef = useRef<{
    list: Operator<Record<string, never>, ListResponse>;
    get: Operator<
      { schema_id: string; include_resolved?: boolean },
      DocResponse
    >;
    create: Operator<{ name: string; from_dataset: boolean }, DocResponse>;
    update: Operator<
      { schema_id: string } & Record<string, unknown>,
      DocResponse
    >;
    del: Operator<{ schema_id: string }, OkResponse>;
    propagate: Operator<
      { path: string; entry?: unknown; source_schema_id?: string },
      OkResponse
    >;
  }>();
  operatorsRef.current = {
    list: useOperatorExecutor(
      `${PLUGIN_PREFIX}/list_label_schema_docs`,
    ) as Operator<Record<string, never>, ListResponse>,
    get: useOperatorExecutor(
      `${PLUGIN_PREFIX}/get_label_schema_doc`,
    ) as Operator<
      { schema_id: string; include_resolved?: boolean },
      DocResponse
    >,
    create: useOperatorExecutor(
      `${PLUGIN_PREFIX}/create_label_schema_doc`,
    ) as Operator<{ name: string; from_dataset: boolean }, DocResponse>,
    update: useOperatorExecutor(
      `${PLUGIN_PREFIX}/update_label_schema_doc`,
    ) as Operator<{ schema_id: string } & Record<string, unknown>, DocResponse>,
    del: useOperatorExecutor(
      `${PLUGIN_PREFIX}/delete_label_schema_doc`,
    ) as Operator<{ schema_id: string }, OkResponse>,
    propagate: useOperatorExecutor(
      `${PLUGIN_PREFIX}/propagate_label_schema_field`,
    ) as Operator<
      { path: string; entry?: unknown; source_schema_id?: string },
      OkResponse
    >,
  };

  const listDocs = useCallback(async () => {
    const res = await operatorAsPromise(operatorsRef.current!.list, {});
    if (!res?.ok) fail(res, "list");
    return res.schemas ?? [];
  }, []);

  const getDoc = useCallback(
    async (schemaId: string, includeResolved = false) => {
      const res = await operatorAsPromise(operatorsRef.current!.get, {
        schema_id: schemaId,
        include_resolved: includeResolved,
      });
      if (!res?.ok || !res.schema) fail(res, "load");
      const vis = res.schema!.visibility;
      return {
        ...res.schema!,
        label_schema: res.schema!.label_schema ?? {},
        visibility: { ...vis, fields: vis?.fields ?? {} },
        resolved: res.resolved,
      };
    },
    [],
  );

  const createDoc = useCallback(async (name: string, fromDataset: boolean) => {
    const res = await operatorAsPromise(operatorsRef.current!.create, {
      name,
      from_dataset: fromDataset,
    });
    if (!res?.ok || !res.schema) fail(res, "create");
    return res.schema!;
  }, []);

  const updateDoc = useCallback(
    async (
      schemaId: string,
      updates: Partial<
        Pick<SchemaDoc, "name" | "description" | "label_schema" | "visibility">
      >,
    ) => {
      const res = await operatorAsPromise(operatorsRef.current!.update, {
        schema_id: schemaId,
        ...updates,
      });
      if (!res?.ok || !res.schema) fail(res, "update");
      return res.schema!;
    },
    [],
  );

  const deleteDoc = useCallback(async (schemaId: string) => {
    const res = await operatorAsPromise(operatorsRef.current!.del, {
      schema_id: schemaId,
    });
    if (!res?.ok) fail(res, "delete");
  }, []);

  const propagateField = useCallback(
    async (
      path: string,
      entry: SchemaDocContentEntry | null,
      sourceSchemaId: string | null,
    ) => {
      const res = await operatorAsPromise(operatorsRef.current!.propagate, {
        path,
        entry: entry ?? undefined,
        source_schema_id: sourceSchemaId ?? undefined,
      });
      if (!res?.ok) fail(res, "propagate field to");
    },
    [],
  );

  return useMemo(
    () => ({
      listDocs,
      getDoc,
      createDoc,
      updateDoc,
      deleteDoc,
      propagateField,
    }),
    [listDocs, getDoc, createDoc, updateDoc, deleteDoc, propagateField],
  );
};

/**
 * The field tier under a doc. Mirrors `label_schema_docs._field_tier`:
 * explicit `hidden` wins; a scanned (content-bearing) field is
 * annotate — there is no explore-only state for a set-up field, so a
 * legacy explicit `explore` on one reads as annotate; an unscanned
 * field is explore-only unless the doc's `default` hides it (an
 * explicit non-hidden tier on it still means visible).
 */
export const docFieldTier = (doc: SchemaDoc, path: string): string => {
  const explicit = doc.visibility.fields?.[path]?.tier;
  // Required/system fields can never be hidden (the server refuses to
  // exclude them — see PROTECTED_PATHS); they always read as visible.
  if (PROTECTED_PATHS.has(path)) {
    return path in doc.label_schema ? "annotate" : "explore";
  }
  if (explicit === "hidden") return "hidden";
  if (path in doc.label_schema) return "annotate";
  if (explicit === "annotate" || explicit === "explore") return "explore";
  return doc.visibility.default === "hidden" ? "hidden" : "explore";
};

/** A copy of `doc.visibility` with one field's tier replaced. */
export const withFieldTier = (
  visibility: SchemaDocVisibility,
  path: string,
  tier: SchemaDocTier,
): SchemaDocVisibility => ({
  ...visibility,
  fields: {
    ...visibility.fields,
    [path]: { ...visibility.fields?.[path], tier },
  },
});

/** A copy of `doc.visibility` with one field's explicit tier removed
 * (its attributes are kept); the field's tier is derived again. */
export const withoutFieldTier = (
  visibility: SchemaDocVisibility,
  path: string,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  if (!entry) return visibility;
  const { tier: _tier, ...rest } = entry;
  const fields = { ...visibility.fields };
  if (Object.keys(rest).length) {
    fields[path] = rest;
  } else {
    delete fields[path];
  }
  return { ...visibility, fields };
};

/**
 * A copy of `doc.visibility` with the field's `explore` attribute tiers
 * dropped. Attribute read-only access now lives on the content
 * (`attribute.read_only`); the explore tier was the earlier, icon-era
 * way to say the same thing, and saving the field retires it. Hidden
 * attribute tiers are kept.
 */
export const withoutExploreAttributeTiers = (
  visibility: SchemaDocVisibility,
  path: string,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  if (!entry?.attributes) return visibility;
  const attributes = Object.fromEntries(
    Object.entries(entry.attributes).filter(([, tier]) => tier !== "explore"),
  );
  const next = { ...entry } as SchemaDocFieldVisibility;
  if (Object.keys(attributes).length) {
    next.attributes = attributes;
  } else {
    delete next.attributes;
  }
  return { ...visibility, fields: { ...visibility.fields, [path]: next } };
};

/**
 * A copy of `doc.visibility` with several attributes' tiers applied at
 * once: `hidden` is recorded, anything else clears the entry (an
 * omitted attribute is annotate).
 */
export const withAttributeTiers = (
  visibility: SchemaDocVisibility,
  path: string,
  tiers: Record<string, SchemaDocTier>,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  const attributes = { ...entry?.attributes };
  for (const [name, tier] of Object.entries(tiers)) {
    if (tier === "hidden" && !PROTECTED_ATTRIBUTES.has(name)) {
      attributes[name] = "hidden";
    } else {
      delete attributes[name];
    }
  }
  const next = { ...entry } as SchemaDocFieldVisibility;
  if (Object.keys(attributes).length) {
    next.attributes = attributes;
  } else {
    delete next.attributes;
  }
  return { ...visibility, fields: { ...visibility.fields, [path]: next } };
};

/** A copy of `doc.visibility` with one attribute's tier replaced. */
export const withAttributeTier = (
  visibility: SchemaDocVisibility,
  path: string,
  attribute: string,
  tier: SchemaDocTier,
): SchemaDocVisibility => {
  const entry = visibility.fields?.[path];
  return {
    ...visibility,
    fields: {
      ...visibility.fields,
      [path]: {
        ...entry,
        attributes: { ...entry?.attributes, [attribute]: tier },
      },
    },
  };
};

/**
 * The Schema Manager's doc-editing mode, or null in classic dataset
 * mode. `useLabelSchema` branches on this so the SAME rich editor
 * (classes/attribute forms, ontology, JSON, scan) authors named-schema
 * content: reads come through the envelope overlay, saves go to the
 * doc via the operators.
 */
export const useManagerDocMode = () => {
  const [docId] = useAtom(selectedSchemaDocId);
  const [doc, setDoc] = useAtom(loadedSchemaDoc);
  const api = useSchemaDocs();
  // The two atoms are written independently; a doc restored by an
  // async write-back after the selection moved on must not be paired
  // with the new id (a later save would write it to the wrong schema).
  if (!docId || !doc || doc.id !== docId) return null;
  return { docId, doc, setDoc, api };
};

/**
 * Preselects the schema currently IN USE when the Schema Manager
 * opens: the active workflow task's schema, else the admin Explore
 * lens; otherwise the dataset default (classic mode). One-shot on
 * mount — the close cleanup nulls the selection, so each open
 * re-derives it, while switching schemas during a session sticks.
 */
export const useOpenOnCurrentSchema = () => {
  const [taskDoc] = useAtom(taskLabelSchemaDoc);
  const lens = useRecoilValue(fos.schemaLens);
  const datasetName = useRecoilValue(fos.datasetName);
  const [selected, setSelected] = useAtom(selectedSchemaDocId);

  // "All fields" / default means classic dataset mode.
  const explicit =
    lens && lens.dataset === datasetName && lens.docId !== "__all__"
      ? lens.docId
      : null;
  const currentId = (taskDoc as { id?: string } | null)?.id ?? explicit;

  const initialRef = useRef<{
    selected: string | null;
    currentId: string | null;
  }>();
  if (!initialRef.current) {
    initialRef.current = { selected, currentId };
  }

  useEffect(() => {
    const initial = initialRef.current!;
    if (!initial.selected && initial.currentId) {
      setSelected(initial.currentId);
    }
    // Mount-only by construction: reads the snapshot taken on first
    // render, so later context changes never override the user.
  }, [setSelected]);
};

/** Convenience: clear doc-mode state (used on modal close). */
export const useResetSchemaDocMode = () => {
  const setSelected = useSetAtom(selectedSchemaDocId);
  const setLoaded = useSetAtom(loadedSchemaDoc);
  return useCallback(() => {
    setSelected(null);
    setLoaded(null);
  }, [setSelected, setLoaded]);
};

/** Read/write the selected doc id. */
export const useSelectedSchemaDocId = () => useAtom(selectedSchemaDocId);
