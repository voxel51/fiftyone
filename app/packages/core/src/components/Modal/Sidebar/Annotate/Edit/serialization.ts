import { isNullish, Primitive } from "@fiftyone/utilities";

/**
 * Problem: user is in EST, server is in UTC. User picks a
 * date-only value, we need to convert it to UTC. This makes the
 * date appear to be a day ahead when it is rendered in the UI back
 * in UTC/server format.
 */
export function dateOnlyToUTC(date: Date): string {
  // Extract year, month, day from the date object (in local timezone)
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Create date at noon UTC (avoids timezone boundary issues)
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0)).toISOString();
}

export function serializeDateValue(type: string, date: Date): string {
  if (type === "date") {
    return dateOnlyToUTC(date);
  }
  return date.toISOString();
}

/**
 * Serialize a date value from the database back to an ISO string
 * @param value - The value to serialize
 * @returns The serialized value
 */
export function serializeDatabaseDateValue(
  value: Primitive | { datetime: number }
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
  value: unknown
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
  fieldValue: Primitive | Date,
  type: string
): Primitive {
  if (fieldValue instanceof Date) {
    return serializeDateValue(type, fieldValue);
  }

  if (type !== "dict") {
    return fieldValue as Primitive;
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
 * pass to SmartForm and handle date/dict fields correctly
 * @param type - the type of the field
 * @param value - the value of the field
 * @returns the initial value of the field
 */
export function parseDatabaseValue(
  type: string,
  value: unknown
): Primitive | Date {
  if (type === "dict") {
    // If the value is null/undefined, initialize with empty JSON object
    if (value === null || value === undefined) {
      return {} as Primitive;
    }
    return value as Primitive;
  }

  /**
   * from the backend we get: { datetime: number, '_cls': 'datetime' }
   */
  if (value && typeof value === "object" && "datetime" in value) {
    const timestamp = value.datetime as number;
    // within editor we use Date objects, parse the timestamp to a Date
    // and then we will serialize it back on submission to the server
    return new Date(timestamp);
  }
  return value as Primitive;
}
