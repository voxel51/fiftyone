import { isNullish, Primitive } from "@fiftyone/utilities";

/**
 * Serialize a date value from the database back to an ISO string
 * @param value - The value to serialize
 * @returns The serialized value
 */
export function serializeDatabaseDateValue(
  value: Primitive | { datetime: number },
): Primitive {
  if (!isDateInDatabaseFormat(value)) return value;
  return new Date(value.datetime).toISOString();
}

/**
 * Is input in format { _cls: "DateTime", datetime: number }?
 * @param value - The value to check
 * @returns True if the value is in the format { _cls: "DateTime", datetime: number }, false otherwise
 */
export function isDateInDatabaseFormat(
  value: unknown,
): value is { datetime: number } {
  return !isNullish(value) && typeof value === "object" && "datetime" in value;
}

/**
 * processes dict fields by parsing string values to objects, returns
 * input value for other field types
 * @param fieldValue - the value of the field
 * @param type - the type of the field
 * @returns the processed value of the field
 */
export function serializeFieldValue(
  fieldValue: Primitive,
  type: string,
): Primitive {
  if (type !== "dict") {
    return fieldValue;
  }

  // handle dict fields
  const trimmedValue = (fieldValue as string).trim();
  if (trimmedValue === "") {
    return null;
  }
  try {
    return JSON.parse(trimmedValue);
  } catch (error) {
    throw new Error(`Invalid JSON: ${trimmedValue}`);
  }
}

/**
 * Convert raw value into a primitive of the format that we can
 * pass to SmartForm and handle date/dict fields correctly. Date and
 * datetime values become ISO instant strings; the SmartForm datepicker
 * widget translates them to and from display-timezone wall clocks.
 * @param value - the value of the field
 * @returns the initial value of the field
 */
export function parseDatabaseValue(value: unknown): Primitive {
  /**
   * from the backend we get: { datetime: number, '_cls': 'datetime' }
   */
  if (isDateInDatabaseFormat(value)) {
    return new Date(value.datetime).toISOString();
  }

  return value as Primitive;
}
