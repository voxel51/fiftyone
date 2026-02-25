import type { JSONDeltas } from "@fiftyone/core";

/**
 * Metadata for generated views (patches/clips/frames).
 * Used to route the patch to the correct label on the source sample.
 */
export type DeltaMetadata = {
  labelId?: string;
  labelPath?: string;
};

/**
 * A function which provides annotation deltas when called.
 * Returns deltas and optional metadata for generated views.
 */
export type DeltaSupplier = () => {
  deltas: JSONDeltas;
  metadata?: DeltaMetadata;
};
