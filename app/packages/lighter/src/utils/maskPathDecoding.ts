/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Coloring } from "@fiftyone/looker";
import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { decodeMaskOnDisk } from "@fiftyone/looker/src/worker/mask-decoder";
import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";

// `decodeMaskOnDisk` only consults `coloring` in its SEGMENTATION branch.
// Detection masks fall through to the default canvas decode path, so a stub
// is sufficient — keeps the call site free of recoil/state dependencies.
const STUB_COLORING = {} as Coloring;

/**
 * Fetches a mask image referenced by `mask_path` and decodes it into an
 * {@link OverlayMask} on the main thread by reusing looker's
 * `decodeMaskOnDisk` pipeline. The result is suitable for handing directly
 * to {@link MaskCanvas} via the pre-decoded mask path.
 *
 * Returns `undefined` if the fetch or decode fails — callers should treat
 * this as "no mask available yet" and proceed without one.
 */
export async function decodeMaskPath(
  maskPath: string,
  field: string,
  cls: string
): Promise<OverlayMask | undefined> {
  try {
    const url = getSampleSrc(maskPath);
    const response = await fetch(url);
    const blob = await response.blob();

    const overlayMask = await decodeMaskOnDisk(blob, cls, field, STUB_COLORING);

    return overlayMask ?? undefined;
  } catch (err) {
    console.error("[decodeMaskPath] failed to decode mask_path:", err);
    return undefined;
  }
}
