import type { JSONDeltas } from "@fiftyone/core";

/**
 * A function which provides a list of JSON-patch operations when called.
 */
export type DeltaSupplier = () => JSONDeltas;
