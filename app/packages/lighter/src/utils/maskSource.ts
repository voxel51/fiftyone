/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { SerializedMask } from "@fiftyone/utilities";

import type { MaskSource } from "./maskBitmapCache";

/**
 * Normalize a label's mask field to the value the decode pipeline consumes:
 * a base64 string for inline `mask` data, or a pre-decoded {@link OverlayMask}
 * for `mask_path` data. Plain `undefined` and `{ $binary: { base64 } }`
 * wrappers are unwrapped.
 *
 * Shared so that everything keying the mask bitmap cache derives the SAME key
 * from a label — a readiness check that computed its key differently would
 * report misses for masks that are in fact cached.
 */
export const maskSourceOf = (
  mask?: SerializedMask | OverlayMask,
): MaskSource | undefined => {
  if (!mask) {
    return undefined;
  }

  if (typeof mask === "string") {
    return mask;
  }

  if ("$binary" in mask) {
    return mask.$binary.base64;
  }

  return mask;
};
