/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type DetectionLabel,
  DetectionOverlay,
} from "@fiftyone/lighter";
import type { SyntheticBox } from "../SyntheticLabelStream";
import type { OverlayAdapter } from "./types";

/**
 * {@link OverlayAdapter} for FiftyOne `Detection` labels (axis-aligned
 * bounding boxes). Maps the per-frame `detections` array onto Lighter
 * `DetectionOverlay`s.
 */
export const detectionAdapter: OverlayAdapter<"detection"> = {
  factoryKey: "detection",
  snapshotKey: "detections",

  extract(data, ctx) {
    return {
      id: data.id,
      props: {
        id: data.id,
        label: toDetectionLabel(data),
        relativeBounds: toRect(data.bounding_box),
        field: ctx.field,
        draggable: ctx.editable,
        resizeable: ctx.editable,
      },
    };
  },

  update(overlay, data) {
    if (!(overlay instanceof DetectionOverlay)) return;
    overlay.relativeBounds = toRect(data.bounding_box);
  },
};

/**
 * Project a normalized bounding box (`[x, y, w, h]` tuple) onto the
 * `Rect` shape Lighter's `DetectionOverlay.relativeBounds` expects.
 *
 * @param bbox - Normalized `[x, y, width, height]` in `[0, 1]`.
 */
function toRect(bbox: SyntheticBox["bounding_box"]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return { x: bbox[0], y: bbox[1], width: bbox[2], height: bbox[3] };
}

/**
 * Project a {@link SyntheticBox} onto a {@link DetectionLabel} for the
 * overlay's `label` field. `index` and `instance` are preserved
 * verbatim — `COLOR_BY.INSTANCE` hashes on them, and without them
 * every detection of the same class collapses to a single color in
 * instance-color mode.
 */
function toDetectionLabel(box: SyntheticBox): DetectionLabel {
  return {
    label: box.label,
    bounding_box: box.bounding_box,
    index: box.index,
    instance: box.instance,
  } as DetectionLabel;
}
