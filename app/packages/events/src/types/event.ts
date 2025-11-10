/**
 * A type representing a group of events, where each key is an event type name
 * and each value is the payload type for that event. If the payload is `undefined` or `null`,
 * the event is considered to have no payload.
 *
 * @example
 * ```typescript
 * type DomainEventGroup = {
 *   "domainFoo:login": { id: string; timestamp: number };
 *   "domainFoo:logout": undefined;
 * };
 * ```
 */
export type EventGroup = Record<string, unknown>;

/**
 * A handler function for a specific event type.
 *
 * @template T - The type of the event payload
 * @param data - The event payload (required unless T extends undefined | null)
 *
 * @example
 * ```typescript
 * // Required payload
 * const handler: EventHandler<DomainEventGroup["domainFoo:login"]> = (data) => {
 *   console.log(data.id, data.timestamp);
 * };
 *
 * // Optional payload (when event type is undefined/null)
 * const noPayloadHandler: EventHandler<DomainEventGroup["domainFoo:logout"]> = () => {
 *   console.log("User logged out");
 * };
 * ```
 */
export type EventHandler<T extends unknown = undefined> = T extends
  | undefined
  | null
  ? () => void
  : (data: T) => void;
