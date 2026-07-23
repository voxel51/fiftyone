import { isNullish, Primitive } from "@fiftyone/utilities";
import { DateTime } from "luxon";

/**
 * FiftyOne renders `date` fields as the UTC calendar date and `datetime`
 * fields in the app timezone (`fo.config.timezone`, "UTC" by default),
 * while react-datepicker only operates on Date objects interpreted in the
 * browser's local timezone. The helpers below translate between the two so
 * the picker shows and stores the same wall-clock values the rest of the
 * app displays.
 */

/**
 * Convert an absolute timestamp into a Date whose local-timezone components
 * match what the app displays for the field, suitable for react-datepicker
 * @param type - the type of the field ("date" or "datetime")
 * @param timestamp - epoch milliseconds
 * @param timeZone - the app display timezone (IANA name, "UTC", or "local")
 * @returns a Date carrying the displayed wall-clock values in local time
 */
export function toPickerDate(
  type: string,
  timestamp: number,
  timeZone: string,
): Date {
  if (type === "date") {
    const date = new Date(timestamp);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
    );
  }

  const dt = DateTime.fromMillis(timestamp, { zone: timeZone });
  return new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second,
    dt.millisecond,
  );
}

/**
 * Serialize a picker Date's calendar date to an absolute instant at noon
 * UTC, so the stored value renders as the same calendar date in every
 * timezone
 */
export function dateOnlyToUTC(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0)).toISOString();
}

export function serializeDateValue(
  type: string,
  date: Date,
  timeZone: string,
): string {
  if (type === "date") {
    return dateOnlyToUTC(date);
  }

  // the picker's Date components are wall-clock values in the app display
  // timezone; interpret them there to recover the absolute instant
  const iso = DateTime.fromObject(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    },
    { zone: timeZone },
  )
    .toUTC()
    .toISO();

  // an invalid zone or date yields null; throw so the caller skips the
  // mutation instead of treating the value as missing and deleting the field
  if (iso === null) {
    throw new Error(`invalid date or timezone: ${date} (${timeZone})`);
  }

  return iso;
}

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
 * @param timeZone - the app display timezone
 * @returns the processed value of the field
 */
export function serializeFieldValue(
  fieldValue: Primitive | Date,
  type: string,
  timeZone: string,
): Primitive {
  if (fieldValue instanceof Date) {
    return serializeDateValue(type, fieldValue, timeZone);
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
 * @param timeZone - the app display timezone
 * @returns the initial value of the field
 */
export function parseDatabaseValue(
  type: string,
  value: unknown,
  timeZone: string,
): Primitive | Date {
  /**
   * from the backend we get: { datetime: number, '_cls': 'datetime' }
   */
  if (isDateInDatabaseFormat(value)) {
    return toPickerDate(type, value.datetime, timeZone);
  }

  // Transient values stored on Sample (e.g. after an undo restored the
  // original database value through setField) are already-serialized ISO
  // strings — parse them back into picker Dates so the picker shows the
  // correct value instead of falling back to "now".
  if ((type === "date" || type === "datetime") && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toPickerDate(type, parsed.getTime(), timeZone);
    }
  }
  return value as Primitive;
}
