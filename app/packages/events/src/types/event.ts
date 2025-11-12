/**
 * Type that represents plain data (no functions, classes, or complex objects).
 * This ensures event payloads are serializable and safe for state derivation.
 *
 * Plain data includes:
 * - Primitives: string, number, boolean, null, undefined
 * - Arrays of plain data
 * - Objects with plain data values (no functions, classes, or circular references)
 *
 * @example
 * ```typescript
 * // ✅ Valid plain data
 * const valid: PlainData = {
 *   id: "123",
 *   count: 42,
 *   tags: ["a", "b", "c"],
 *   metadata: { key: "value" }
 * };
 *
 * // ❌ Invalid (contains function)
 * const invalid: PlainData = {
 *   id: "123",
 *   // Error: function not allowed
 *   callback: () => {}
 * };
 * ```
 */
export type PlainData =
  | string
  | number
  | boolean
  | null
  | undefined
  | PlainData[]
  | { [key: string]: PlainData };

/**
 * A type representing a group of events, where each key is an event type name
 * and each value is the payload type for that event. If the payload is `undefined` or `null`,
 * the event is considered to have no payload.
 *
 * **Important:** Event payloads must be plain data (serializable).
 * @example
 * ```typescript
 * type DomainEventGroup = {
 *   "domainFoo:login": { id: string; timestamp: number };
 *   "domainFoo:logout": undefined;
 * };
 *
 * // ✅ Valid
 * const bus = useEventBus<DomainEventGroup>();
 * bus.dispatch("domainFoo:login", { id: "123", timestamp: Date.now() });
 *
 * // ❌ Invalid (TypeScript will error)
 * bus.dispatch("domainFoo:login", {
 *   id: "123",
 *    // Error: function not allowed in payload
 *   callback: () => {}
 * });
 * ```
 */
export type EventGroup = Record<string, PlainData | undefined | null>;

/**
 * A handler function for a specific event type.
 * Handlers can be synchronous (return void) or asynchronous (return Promise<void>).
 * Async handlers are executed in parallel and do not block other handlers.
 *
 * @template T - The type of the event payload
 * @param data - The event payload (required unless T extends undefined | null)
 * @returns void for sync handlers, or Promise<void> for async handlers
 *
 * @example
 * ```typescript
 * // Synchronous handler with payload
 * const syncHandler: EventHandler<DomainEventGroup["domainFoo:login"]> = (data) => {
 *   console.log(data.id, data.timestamp);
 * };
 *
 * // Asynchronous handler with payload
 * const asyncHandler: EventHandler<DomainEventGroup["domainFoo:login"]> = async (data) => {
 *   await fetch(`/api/log/${data.id}`);
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
  ? () => void | Promise<void>
  : (data: T) => void | Promise<void>;
