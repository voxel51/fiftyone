/**
 * Generate a URI from the path parts using URL-safe encoding.
 *
 * @param parts Path parts
 */
export const encodeURIPath = (parts: string[]): string => {
  const encoded = parts.map((part) => encodeURIComponent(part)).join("/");
  return `/${encoded}`;
};

/**
 * Serialized datetime format.
 */
export type DateTime = string | { $date: string } | { datetime: number };

/**
 * Parse a serialized timestamp into a {@link Date}.
 *
 * @param timestamp Serialized timestamp
 */
export const parseTimestamp = (timestamp?: DateTime): Date | null => {
  if (timestamp) {
    return typeof timestamp === "string"
      ? new Date(timestamp)
      : "$date" in timestamp
      ? new Date(timestamp.$date)
      : "datetime" in timestamp
      ? new Date(timestamp.datetime)
      : null;
  }

  return null;
};

/**
 * Convert a {@link DateTime} to milliseconds.
 *
 * If the data cannot be parsed, returns 0.
 *
 * @param dateTime Timestamp to parse
 */
const dateTimeToMs = (dateTime?: DateTime): number => {
  return parseTimestamp(dateTime)?.getTime() ?? 0;
};

/**
 * Return whether the two provided timestamps are equal.
 *
 * This method attempts to parse each timestamp into a {@link Date},
 * and then compares the dates via {@link getTime}.
 *
 * @param a Timestamp to compare
 * @param b Other timestamp
 */
export const areTimestampsEqual = (a?: DateTime, b?: DateTime): boolean => {
  return dateTimeToMs(a) === dateTimeToMs(b);
};

/**
 * Parse an ETag from a raw header value.
 *
 * ETags are often surrounded by quotes, and may be prefixed with W/.
 *
 * @param headerValue Raw header value
 */
export const parseETag = (headerValue?: string): string | null => {
  if (!headerValue) {
    return null;
  }

  let cleanedValue = headerValue;

  if (cleanedValue.startsWith('"') && cleanedValue.endsWith('"')) {
    cleanedValue = cleanedValue.substring(1, headerValue.length - 1);
  }

  if (cleanedValue.startsWith("W/")) {
    cleanedValue = cleanedValue.substring(2);
  }

  return cleanedValue;
};

/**
 * Return true if the provided data is an object.
 *
 * @param data Data to check
 */
export const isObject = (data: unknown): boolean => {
  return data && typeof data === "object" && !Array.isArray(data);
};
