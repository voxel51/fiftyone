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
