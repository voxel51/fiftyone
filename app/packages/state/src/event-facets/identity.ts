/** The virtual sidebar field; values retain projection-scoped event identity. */
export const EVENTS_FIELD = "_events";

/** Stable identity of an event kind within its projection. */
export interface EventIdentity {
  readonly projection: string;
  readonly id: string;
}

/** Encodes a projection/id pair for categorical filter values. */
export function eventIdentity(event: EventIdentity): string {
  return JSON.stringify([event.projection, event.id]);
}

/** Decodes a stored event filter value without accepting display names. */
export function parseEventIdentity(value: unknown): EventIdentity | null {
  if (typeof value !== "string") return null;
  try {
    const pair: unknown = JSON.parse(value);
    if (
      Array.isArray(pair) &&
      pair.length === 2 &&
      pair.every((part) => typeof part === "string" && part.length > 0)
    )
      return { projection: pair[0], id: pair[1] };
  } catch {
    return null;
  }
  return null;
}
