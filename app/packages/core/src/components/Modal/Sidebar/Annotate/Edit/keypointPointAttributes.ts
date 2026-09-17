/**
 * Keypoint per-point attributes: schema attributes declared with
 * `scope: "point"` are stored as lists parallel to `points` and edited
 * node-by-node in the KeypointDetails inspector, never as label-level values.
 */

import type { AttributeConfig } from "../SchemaManager/utils";

export type PointAttributeType = "bool" | "float" | "int" | "str";

export type PointAttributeValue = boolean | number | string | null;

export interface PointAttributeSpec {
  name: string;
  /** The ELEMENT type — storage is a list of these, parallel to `points`. */
  type: PointAttributeType;
  values?: (string | number)[];
  range?: [number, number];
  readOnly?: boolean;
}

/**
 * Reserved per-point list names that predate the schema scope marker: COCO
 * imports materialize them without any schema declaring them.
 */
export const RESERVED_KEYPOINT_POINT_KEYS: ReadonlySet<string> = new Set([
  "confidence",
  "visible",
]);

const POINT_ATTRIBUTE_TYPES: ReadonlySet<string> = new Set([
  "bool",
  "float",
  "int",
  "str",
]);

const isPointAttributeType = (type: string): type is PointAttributeType =>
  POINT_ATTRIBUTE_TYPES.has(type);

/**
 * Every key stored as a list parallel to `points`: the reserved names plus
 * schema attributes declared with point scope. These are per-frame on video
 * tracks (they follow `points` frame by frame) and are excluded from the
 * label-level form.
 */
export const getKeypointPointKeys = (
  attributes: readonly AttributeConfig[] | undefined,
): Set<string> => {
  const keys = new Set(RESERVED_KEYPOINT_POINT_KEYS);
  for (const attr of attributes ?? []) {
    if (attr.scope === "point" && attr.name) {
      keys.add(attr.name);
    }
  }
  return keys;
};

/**
 * The point-scoped schema attributes the inspector renders. Unsupported
 * element types are skipped defensively — the schema validator only accepts
 * bool/float/int/str for point scope.
 */
export const getPointAttributeSpecs = (
  attributes: readonly AttributeConfig[] | undefined,
): PointAttributeSpec[] => {
  const specs: PointAttributeSpec[] = [];
  for (const attr of attributes ?? []) {
    if (attr.scope !== "point" || !attr.name) continue;
    if (!isPointAttributeType(attr.type)) continue;
    specs.push({
      name: attr.name,
      type: attr.type,
      values: attr.values,
      range: attr.range,
      readOnly: attr.read_only,
    });
  }
  return specs;
};

/**
 * Confidence is the core per-point attribute (`Keypoint.confidence`); the
 * inspector offers it even when no schema declares it.
 */
export const CONFIDENCE_FALLBACK_SPEC: PointAttributeSpec = {
  name: "confidence",
  type: "float",
  range: [0, 1],
};

/**
 * Coerce a stored list entry to the attribute's element type; anything else
 * is unset. Float reads may deliver NaN holes as `"nan"` strings (the
 * GraphQL non-finite convention) — those are unset, but for a str attribute
 * `"nan"` is a legal value and passes through.
 */
export const toPointAttributeValue = (
  type: PointAttributeType,
  entry: unknown,
): PointAttributeValue => {
  switch (type) {
    case "bool":
      return typeof entry === "boolean" ? entry : null;
    case "float":
    case "int":
      return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
    case "str":
      return typeof entry === "string" ? entry : null;
  }
};

/**
 * The unset-entry filler per element type. Float uses NaN — the ODM's
 * ListField(FloatField) cannot LOAD null elements (the whole document fails
 * to hydrate server-side), while NaN round-trips like point holes do. The
 * other types use null: NaN through BooleanField reads back as True
 * (`bool(nan)`), and null both loads cleanly and keeps dynamic field
 * inference on the declared element type.
 */
export const pointAttributeHole = (type: PointAttributeType): number | null =>
  type === "float" ? NaN : null;

/**
 * Build the full-length parallel list for a single-node commit: the edited
 * index takes `value` (null clears it to the hole filler), every other index
 * keeps its existing entry coerced to the element type. Coercion matters on
 * the write path: the wire encoder converts non-finite NUMBERS everywhere
 * but gates `"nan"` STRINGS to reserved field names, so read-side strings
 * must never be echoed back under a custom attribute name.
 */
export const buildPointAttributeList = (
  type: PointAttributeType,
  existing: readonly unknown[] | undefined,
  length: number,
  index: number,
  value: PointAttributeValue,
): PointAttributeValue[] => {
  const hole = pointAttributeHole(type);
  return Array.from({ length }, (_, i) => {
    const entry =
      i === index ? value : toPointAttributeValue(type, existing?.[i]);
    return entry ?? hole;
  });
};
