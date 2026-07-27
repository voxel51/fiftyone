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
