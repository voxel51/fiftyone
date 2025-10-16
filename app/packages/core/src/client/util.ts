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
      : timestamp.$date
      ? new Date(timestamp.$date)
      : new Date(timestamp.datetime);
  }

  return null;
};
