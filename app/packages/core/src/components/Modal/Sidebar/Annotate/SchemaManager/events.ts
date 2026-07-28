import { createUseEventHandler, useEventBus } from "@fiftyone/events";

/**
 * Event group for the Schema Manager.
 *
 * These events signal the completion of async operations (scan, validate, save)
 * and are consumed by e2e tests for synchronization.
 */
export type SchemaManagerEventGroup = {
  "schema-manager:scan-complete": void;
  "schema-manager:valid-json": void;
  "schema-manager:invalid-json": void;
  "schema-manager:save-complete": void;
};

const CHANNEL_ID = "schema-manager";

export const useSchemaManagerEventBus = () =>
  useEventBus<SchemaManagerEventGroup>(CHANNEL_ID);

export const useSchemaManagerEventHandler =
  createUseEventHandler<SchemaManagerEventGroup>(CHANNEL_ID);

/**
 * DOM event names corresponding to each schema manager event.
 *
 * The e2e test infrastructure ({@link EventUtils}) listens for DOM
 * `CustomEvent`s via `document.addEventListener`. This map bridges the
 * typed event bus to the DOM so that Playwright tests can observe these
 * events without reaching into the in-memory event bus.
 */
const DOM_EVENT_NAMES: Record<keyof SchemaManagerEventGroup, string> = {
  "schema-manager:scan-complete": "schema-manager-scan-complete",
  "schema-manager:valid-json": "schema-manager-valid-json",
  "schema-manager:invalid-json": "schema-manager-invalid-json",
  "schema-manager:save-complete": "schema-manager-save-complete",
};

/**
 * Dispatch a schema manager event on both the typed event bus and the DOM.
 *
 * @param dispatch - The event bus dispatch function from {@link useSchemaManagerEventBus}
 * @param event - The event to dispatch
 */
export const dispatchSchemaManagerEvent = (
  dispatch: ReturnType<typeof useSchemaManagerEventBus>["dispatch"],
  event: keyof SchemaManagerEventGroup,
) => {
  dispatch(event);
  document.dispatchEvent(new CustomEvent(DOM_EVENT_NAMES[event]));
};
