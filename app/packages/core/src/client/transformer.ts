/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { cloneDeep } from "lodash";
import { isObject, NONFINITE_FIELDS } from "@fiftyone/utilities";

/**
 * DataTransformer implementations offer conversion from one record type to another.
 */
export type DataTransformer = {
  transform: (data: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * FieldTransformer implementations offer conversion for a specific field type.
 */
export type FieldTransformer = {
  canTransform: (data: unknown) => boolean;
  transform: (data: unknown) => unknown;
};

/**
 * Convert serialized python datetime.datetime data to a format consistent with
 * graphql.
 */
const DateTimeTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    return isObject(data) && "$date" in data;
  },
  transform: (data: unknown): { _cls: "DateTime"; datetime: number } => {
    const date = new Date((data as { $date: string }).$date);
    return { _cls: "DateTime", datetime: date.getTime() };
  },
};

/**
 * Convert serialized bson.ObjectId data to a format consistent with graphql.
 */
const ObjectIdTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    return isObject(data) && "$oid" in data;
  },
  transform: (data: unknown): string => {
    return (data as { $oid: string }).$oid;
  },
};

/**
 * Convert serialized bson.Binary data to a format consistent with graphql.
 */
const BinaryTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    if (!isObject(data) || !("$binary" in data)) return false;
    const inner = (data as { $binary: unknown }).$binary;
    return (
      isObject(inner) &&
      typeof (inner as { base64?: unknown }).base64 === "string"
    );
  },
  transform: (data: unknown): string => {
    return (data as { $binary: { base64: string } }).$binary.base64;
  },
};

/**
 * Convert serialized bson non-finite doubles (`{ $numberDouble: "NaN" }`) to
 * the string convention GraphQL sample reads use (`"nan"` / `"inf"` /
 * `"-inf"`, see `NONFINITE` in `@fiftyone/looker`). Finite values (which bson
 * only wraps in explicit-typing modes) pass through as plain numbers.
 */
const NumberDoubleTransformer: FieldTransformer = {
  canTransform: (data: unknown): boolean => {
    return isObject(data) && "$numberDouble" in data;
  },
  transform: (data: unknown): string | number => {
    const value = Number((data as { $numberDouble: string }).$numberDouble);
    if (Number.isNaN(value)) return "nan";
    if (value === Infinity) return "inf";
    if (value === -Infinity) return "-inf";
    return value;
  },
};

const fieldTransformers = [
  DateTimeTransformer,
  ObjectIdTransformer,
  BinaryTransformer,
  NumberDoubleTransformer,
];

/**
 * Transformer which converts `fo.Sample.to_dict()` serialization to a format
 * consistent with graphql.
 */
const SampleTransformer: DataTransformer = {
  transform: (data: Record<string, unknown>): Record<string, unknown> => {
    // recursive helper function
    const transformInner = (innerData: unknown): unknown => {
      // try to use a registered transformer
      for (const transformer of fieldTransformers) {
        if (transformer.canTransform(innerData)) {
          return transformer.transform(innerData);
        }
      }

      // otherwise recursively transform
      if (Array.isArray(innerData)) {
        return innerData.map((e) => transformInner(e));
      } else if (isObject(innerData)) {
        for (const key of Object.keys(innerData)) {
          innerData[key] = transformInner(innerData[key]);
        }
      }

      return innerData;
    };

    // transformation happens in-place, so create a new copy of the data first
    const result = cloneDeep(data);
    transformInner(result);
    return result;
  },
};

/**
 * Transform sample data returned by `fo.Sample.to_dict()` to a format
 * compatible with graphql query results.
 *
 * @param sample Serialized sample data
 */
export const transformSampleData = (
  sample: Record<string, unknown>,
): Record<string, unknown> => {
  return SampleTransformer.transform(sample);
};

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const OBJECT_ID_FIELDS = new Set(["_id", "_sample_id"]);

// The conversion below is gated to the shared `NONFINITE_FIELDS` keys (fields
// whose values may legitimately hold non-finite floats — a skipped keypoint
// node is `[NaN, NaN]`) so a string field that happens to contain "nan" is
// never touched. The same gate governs the compare-side collapse in
// `@fiftyone/utilities`' `normalizeForCompare`.
const NONFINITE_STRINGS: Record<string, string> = {
  nan: "NaN",
  inf: "Infinity",
  "-inf": "-Infinity",
};

/**
 * Convert a non-finite value in a `NONFINITE_FIELDS` context to bson extended
 * JSON (`{ $numberDouble: "NaN" }`), which `bson.json_util.loads` decodes to
 * a real `float("nan")` server-side. Handles both representations the App
 * holds: `"nan"`-style strings (as delivered by sample reads) and real
 * non-finite numbers. Returns `undefined` when no conversion applies.
 */
const toNumberDouble = (
  data: unknown,
): { $numberDouble: string } | undefined => {
  if (typeof data === "string" && data in NONFINITE_STRINGS) {
    return { $numberDouble: NONFINITE_STRINGS[data] };
  }

  if (typeof data === "number" && !Number.isFinite(data)) {
    return { $numberDouble: String(data) };
  }

  return undefined;
};

/**
 * Field context for a json-patch delta value: the last non-index segment of
 * the delta's path names the field the value lands in, which the encoders in
 * {@link toExtendedJson} gate on. A delta targeting a sub-path (e.g.
 * `.../points/3`) carries a bare value with no surrounding key to recurse
 * through, so the context must come from the path.
 */
export const patchPathFieldContext = (path?: string): string | undefined => {
  if (!path) {
    return undefined;
  }

  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(segments[i]) && segments[i] !== "-") {
      return segments[i];
    }
  }

  return undefined;
};

/**
 * Convert a value to MongoDB Extended JSON format.
 *
 * This is the inverse of the {@link ObjectIdTransformer}: it converts plain
 * ObjectId hex strings back to `{ $oid: "..." }` so that the server can
 * deserialize them as `bson.ObjectId` rather than storing them as strings.
 *
 * @param data Value to transform
 * @param fieldName Name of the field containing the value (used to identify
 *   ObjectId fields)
 */
export const toExtendedJson = (data: unknown, fieldName?: string): unknown => {
  if (
    typeof data === "string" &&
    fieldName &&
    OBJECT_ID_FIELDS.has(fieldName) &&
    OBJECT_ID_PATTERN.test(data)
  ) {
    return { $oid: data };
  }

  // A non-finite NUMBER is unambiguous — encode it wherever it appears, or
  // JSON.stringify silently turns it into null (a delta targeting a sub-path
  // like `.../points/3` carries a bare array with no field key to gate on).
  if (typeof data === "number" && !Number.isFinite(data)) {
    return { $numberDouble: String(data) };
  }

  // "nan"-style STRINGS stay gated to the non-finite fields so a string
  // field that happens to contain "nan" is never touched
  if (fieldName && NONFINITE_FIELDS.has(fieldName)) {
    const numberDouble = toNumberDouble(data);
    if (numberDouble) {
      return numberDouble;
    }
  }

  if (Array.isArray(data)) {
    // Keep the field context: coordinates sit inside nested arrays under
    // their field's key (e.g. `points: [[x, y], ...]`).
    return data.map((item) => toExtendedJson(item, fieldName));
  }

  if (isObject(data)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      result[key] = toExtendedJson(value, key);
    }
    return result;
  }

  return data;
};
