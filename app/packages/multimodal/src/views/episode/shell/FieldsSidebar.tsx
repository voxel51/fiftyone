import JSONViewer from "@fiftyone/components/src/components/JSONViewer";
import {
  fieldVisibilityStage,
  useActiveModalSample,
  useSampleFields,
  useTimeZone,
} from "@fiftyone/state";
import { formatPrimitive } from "@fiftyone/utilities";
import { getNestedField } from "@fiftyone/utilities/src/sample/pointer";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useRecoilValue } from "recoil";
import settingsStyles from "../tiles/Tile.settings.module.css";

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

const isMultimodalProjectionField = (path: string): boolean =>
  MULTIMODAL_PROJECTION_GRAINS.has(path.split(".", 1)[0]);

/**
 * The raw sample doc keys some fields by their Mongo `dbField` rather than
 * their schema path — most commonly `id` (schema path) / `_id` (actual key).
 * Only the field's own last path segment can differ this way (nested
 * embedded-document fields don't get renamed at the db level), so swapping
 * just that segment is enough.
 */
const resolveDbPath = (field: {
  path: string;
  dbField?: string | null;
}): string => {
  if (!field.dbField) {
    return field.path;
  }
  const segments = field.path.split(".");
  segments[segments.length - 1] = field.dbField;
  return segments.join(".");
};

/**
 * A formatted field value, tagged with how it should render: `muted` for
 * "nothing here" placeholders (no value set, or an empty list/dict), `json`
 * for multi-key objects/arrays that need a real (searchable, collapsible)
 * tree view to be readable, and `text` for everything else.
 */
type FormattedFieldValue =
  | { kind: "muted"; text: string }
  | { kind: "json"; value: object }
  | { kind: "text"; text: string };

/**
 * Formats a field's value for display. Dates/datetimes go through the same
 * formatter as the classic sidebar rather than showing their raw
 * `{"_cls":"DateTime","datetime":<ms>}` wrapper; non-empty arrays/objects
 * (metadata, …) render through `JSONViewer` (search + collapsible tree)
 * rather than a flat stringified dump, since these can be arbitrarily large
 * and deeply nested; empty arrays/objects (e.g. `tags: []`) and
 * `null`/`undefined` (no value set — including fields, like `metadata`,
 * that were never computed for this sample) render as muted placeholders
 * rather than literal "[]"/"{}" text.
 */
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
  if (
    typeof value === "object" &&
    "datetime" in (value as Record<string, unknown>)
  ) {
    const formatted = formatPrimitive({
      ftype,
      timeZone,
      value: value as { datetime: number },
    });
    if (formatted !== null) {
      return { kind: "text", text: String(formatted) };
    }
  }
  const isEmptyCollection = Array.isArray(value)
    ? value.length === 0
    : Object.keys(value as Record<string, unknown>).length === 0;
  if (isEmptyCollection) {
    return { kind: "muted", text: "None" };
  }
  return { kind: "json", value: value as object };
};

/**
 * "Fields" tab for the MM right sidebar: the current sample's actual field
 * *values* (not the schema). Field paths/order come from the same
 * `fields()` selector the classic (now-removed-in-Multimodal) sidebar uses —
 * that's schema metadata already resolved by the dataset view, so no new
 * GraphQL query — but each value is read from the active modal sample.
 */
const FieldsSidebar: React.FC = () => {
  const sampleFields = useSampleFields();
  const activeSample = useActiveModalSample();
  const timeZone = useTimeZone();
  const fvStage = useRecoilValue(fieldVisibilityStage);
  const hiddenPaths = new Set(fvStage?.kwargs?.field_names ?? []);
  const nonPrivateFields = sampleFields.filter(
    (field) =>
      field &&
      !field.path.startsWith("_") &&
      !isMultimodalProjectionField(field.path) &&
      !hiddenPaths.has(field.path),
  );

  if (nonPrivateFields.length === 0) {
    return (
      <span
        className={settingsStyles.emptyText}
        data-testid="episode-fields-empty"
      >
        This dataset has no sample fields.
      </span>
    );
  }

  return (
    <div className={settingsStyles.root} data-testid="episode-fields-body">
      {nonPrivateFields.map((field) => {
        const formatted = formatFieldValue(
          getNestedField(activeSample, resolveDbPath(field)),
          field.ftype,
          timeZone,
        );
        return (
          <div className={settingsStyles.field} key={field.path}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              {field.path}
            </Text>
            {formatted.kind === "json" ? (
              <JSONViewer
                value={formatted.value as never}
                containerProps={{ className: settingsStyles.jsonViewer }}
              />
            ) : (
              <Text
                variant={TextVariant.Xs}
                color={
                  formatted.kind === "muted"
                    ? TextColor.Secondary
                    : TextColor.Primary
                }
              >
                {formatted.text}
              </Text>
            )}
            {field.description ? (
              <span className={settingsStyles.metaText}>
                {field.description}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default FieldsSidebar;
