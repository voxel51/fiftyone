/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Coloring } from "@fiftyone/looker";
import type { MaskTargets } from "@fiftyone/looker/src/state";

/**
 * The slice of looker's `Coloring` that `decodeMaskOnDisk` reads.
 *
 * Only its `Segmentation` branch consults coloring, and only to ask whether
 * the field's mask targets are RGB-keyed — an RGB mask keeps its channels, an
 * indexed one collapses to a single channel. Everything else in `Coloring` is
 * for painting, which this surface does itself. The targets default to `{}`
 * rather than staying absent: the decoder throws on undefined targets, so a
 * dataset with no mask targets could not decode an 8-bit PNG at all.
 */
export const coloringForMaskDecode = (
  field: string,
  maskTargets: MaskTargets | undefined,
): Coloring =>
  ({
    maskTargets: { [field]: maskTargets ?? {} },
    defaultMaskTargets: {},
  }) as unknown as Coloring;
