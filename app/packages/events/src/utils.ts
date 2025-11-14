import { v4 as uuidv4 } from "uuid";

/**
 * Generates a unique source ID for events.
 *
 * @param prefix - Optional prefix to add context to the source ID of an event
 * @returns A unique source ID string in the format: `prefix-uuidv4` or just `uuidv4` if no prefix is provided
 *
 * @example
 * ```typescript
 * const sourceId = generateSourceId(); // "550e8400-e29b-41d4-a716-446655440000"
 * const sourceId = generateSourceId("save"); // "save-550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateSourceId(prefix?: string): string {
  const id = uuidv4();
  return prefix ? `${prefix}-${id}` : id;
}
