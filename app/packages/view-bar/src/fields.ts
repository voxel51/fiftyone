/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Narrows the field picker to the fields a parameter actually accepts.
 *
 * Each stage declares its own constraints — `FilterLabels` takes a label field,
 * `ToTrajectories` a frame-level one, `GeoNear` a `GeoLocation` — and the server
 * serves them alongside the parameter. Offering a field the stage will reject is
 * a choice that only fails later, so the picker offers none of them.
 */

import type { FieldType } from "@fiftyone/state";

/** One way a parameter can be satisfied, as the server describes it. */
export interface FieldConstraint {
  level: string;
  existence: string;
  ftypes: readonly string[];
  labelTypes: readonly string[];
}

const EMBEDDED_DOCUMENT = "fiftyone.core.fields.EmbeddedDocumentField";

const matchesLevel = (level: string, field: FieldType): boolean => {
  if (level === "FRAME") return field.frame;
  if (level === "SAMPLE") return !field.frame;
  return true;
};

/**
 * `ftypes` matches the field's own type or, for a list, what it holds — a
 * parameter taking a `FrameSupportField` accepts a list of them too.
 */
const matchesType = (ftypes: readonly string[], field: FieldType): boolean =>
  ftypes.length === 0 ||
  ftypes.includes(field.ftype) ||
  (field.subfield !== null && ftypes.includes(field.subfield)) ||
  (field.embeddedDocType !== null && ftypes.includes(field.embeddedDocType));

const matchesLabel = (
  labelTypes: readonly string[],
  field: FieldType,
): boolean =>
  labelTypes.length === 0 ||
  (field.ftype === EMBEDDED_DOCUMENT &&
    field.embeddedDocType !== null &&
    labelTypes.includes(field.embeddedDocType));

const satisfies = (constraint: FieldConstraint, field: FieldType): boolean =>
  matchesLevel(constraint.level, field) &&
  matchesType(constraint.ftypes, field) &&
  matchesLabel(constraint.labelTypes, field);

/**
 * The paths a parameter accepts. A parameter with no constraints accepts every
 * field, and an unknown path is kept rather than dropped — the schema is the
 * App's copy and being missing from it is not the same as being invalid.
 */
export const allowedFields = (
  paths: readonly string[],
  constraints: readonly FieldConstraint[],
  types: ReadonlyMap<string, FieldType>,
): string[] => {
  if (!constraints.length) return [...paths];

  return paths.filter((path) => {
    const field = types.get(path);
    if (!field) return true;

    return constraints.some((constraint) => satisfies(constraint, field));
  });
};

/**
 * The paths an expression written for `root` can name.
 *
 * A filter on a label field is applied to each label, not to the sample, so
 * `FilterLabels("detections", ...)` is written as `F("label")` — not
 * `F("detections.detections.label")`. The suggestions have to match, so they
 * are the field's own children with the path to them stripped off.
 *
 * A list of labels nests them under a single attribute (`detections.detections`)
 * which is not part of what the expression names either, so a lone shared first
 * segment is stripped with it. A field whose children fan out — a
 * `Classification`'s `label`, `confidence`, `logits` — keeps them all.
 */
export const scopedTo = (root: string, paths: readonly string[]): string[] => {
  return [...scopedEntries(root, paths).keys()];
};

/**
 * {@link scopedTo}, keeping the full dataset path each scoped name stands for.
 *
 * A scoped name is what the expression says, but the schema knows fields by
 * their full paths — resolving what kind of value `label` holds means asking
 * about `predictions.detections.label`.
 */
export const scopedEntries = (
  root: string,
  paths: readonly string[],
): Map<string, string> => {
  const prefix = `${root}.`;
  const children = paths
    .filter((path) => path.startsWith(prefix))
    .map((path) => [path.slice(prefix.length), path] as const);

  if (!children.length) return new Map();

  const heads = new Set(children.map(([child]) => child.split(".")[0]));
  const sorted = (entries: (readonly [string, string])[]) =>
    new Map(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  if (heads.size > 1) return sorted(children);

  // Only strip the shared segment when there is something under it — a field
  // with a single leaf child shares a head too, and that leaf is the answer
  const nested = `${[...heads][0]}.`;
  const deeper = children
    .filter(([child]) => child.startsWith(nested))
    .map(([child, path]) => [child.slice(nested.length), path] as const);

  return sorted(deeper.length ? deeper : children);
};
