import { areTimestampsEqual, DateTime } from "@fiftyone/core/src/client/util";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DICT_FIELD,
  Field,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  Primitive,
  Schema,
  STRING_FIELD,
  UUID_FIELD,
} from "@fiftyone/utilities";
import { isEqual } from "lodash";

/**
 * Supported primitive field types for annotation editing.
 * Matches SUPPORTED_PRIMITIVES in fiftyone/core/annotation/constants.py
 */
const SUPPORTED_PRIMITIVE_FTYPES = new Set([
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DICT_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  UUID_FIELD,
]);

/**
 * Supported subfield types for list primitives.
 * Matches SUPPORTED_LISTS_OF_PRIMITIVES in fiftyone/core/annotation/constants.py
 */
const SUPPORTED_LIST_PRIMITIVE_SUBFIELDS = new Set([
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  STRING_FIELD,
]);

/**
 * Returns true if data can be safely cast to a {@link DateTime}.
 *
 * @param data Data to check
 */
const isDateTimeObj = (data?: Primitive): data is { datetime: number } => {
  return (
    data !== null &&
    data !== undefined &&
    typeof data === "object" &&
    "datetime" in data &&
    Number.isFinite(data.datetime)
  );
};

/**
 * Check if the field schema represents a supported primitive type.
 */
export const isPrimitiveFieldType = (field: Field): boolean => {
  if (!field?.ftype) {
    return false;
  }

  if (SUPPORTED_PRIMITIVE_FTYPES.has(field.ftype)) {
    return true;
  }

  // Check list of primitives (e.g., list<string>, list<int>, list<float>)
  if (
    field.ftype === LIST_FIELD &&
    field.subfield &&
    SUPPORTED_LIST_PRIMITIVE_SUBFIELDS.has(field.subfield)
  ) {
    return true;
  }

  return false;
};

/**
 * Returns true if two {@link Primitive} values are equal.
 *
 * @param a Data to compare
 * @param b Other data
 */
export const arePrimitivesEqual = (a?: Primitive, b?: Primitive): boolean => {
  if (isDateTimeObj(a) || isDateTimeObj(b)) {
    return areTimestampsEqual(a as DateTime, b as DateTime);
  } else {
    return isEqual(a, b);
  }
};

/**
 * Get the field schema for the given path.
 *
 * @param schema Sample schema
 * @param path Field path
 */
export const getFieldSchema = (schema: Schema, path: string): Field | null => {
  if (!schema || !path) {
    return null;
  }

  const pathParts = path.split(".");
  const root = schema[pathParts[0]];
  return getFieldSchemaHelper(root, pathParts.slice(1));
};

/**
 * Recursive helper for {@link getFieldSchema}.
 */
const getFieldSchemaHelper = (
  field: Field,
  pathParts: string[]
): Field | null => {
  if (!field) {
    return null;
  }

  if (!pathParts || pathParts.length === 0) {
    return field;
  }

  const nextField = field.fields?.[pathParts[0]];
  return getFieldSchemaHelper(nextField, pathParts.slice(1));
};
