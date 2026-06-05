/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure mapping from a lighter overlay to the {@link LabelProxy} the delta
 * pipeline expects.
 *
 * Owns the mask serialization policy for Detection overlays:
 *
 *  - When the overlay still has a mask, emit the mask data — preferring a
 *    pending edit over the persisted bytes.
 *  - When the overlay no longer has a mask but used to, emit `{mask: null,
 *    mask_path: null}` so the merge in `buildDetectionsMutationDelta` clears
 *    the persisted value.
 *  - When the overlay never had a mask, emit nothing for the mask channel.
 *
 * Getting that polarity wrong silently corrupts saves; the dedicated unit
 * tests in `buildAnnotationLabel.test.ts` cover each branch.
 */

import {
  type BaseOverlay,
  ClassificationOverlay,
  DetectionOverlay,
  KeypointOverlay,
  type KeypointLabel,
  PolylineOverlay,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { BoundingBox } from "@fiftyone/looker/src/state";
import { hasValidBounds } from "@fiftyone/utilities";
import type { LabelProxy } from "../deltas";

/**
 * Build a {@link LabelProxy} instance from a lighter overlay.
 *
 * Returns `undefined` for overlays that don't represent a persistable label
 * (missing `label` text, empty bounds on a Detection, etc.).
 *
 * @param overlay Lighter overlay
 */
export const buildAnnotationLabel = (
  overlay: BaseOverlay
): LabelProxy | undefined => {
  // Non-persistent overlays live in the scene for UX only and must never
  // reach the persistence pipeline.
  if (!overlay.isPersistent) {
    return undefined;
  }

  if (overlay instanceof DetectionOverlay) {
    const bounds = overlay.relativeBounds;
    const boundingBox: BoundingBox = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (hasValidBounds(boundingBox)) {
      // Pull mask/mask_path off so we can decide what (if anything) to persist
      // for the mask channel.
      const { mask: _mask, mask_path: _maskPath, ...data } = overlay.label;
      const pendingMask = overlay.getPendingMask();

      // Include mask data only when the overlay still has a mask.
      // Explicitly null out mask/mask_path when removed so the merge
      // in buildDetectionsMutationDelta overrides the existing value.
      const hadMask = _mask || _maskPath;
      const maskData = overlay.hasMask()
        ? {
            ...(_mask && { mask: _mask }),
            ...(pendingMask && { mask: pendingMask }),
            // Edits to a `mask_path`-sourced detection are persisted as an
            // inline `mask`; null the path so the backend doesn't end up
            // with both fields pointing at divergent data.
            ...(pendingMask && _maskPath && { mask_path: null }),
          }
        : hadMask
        ? { mask: null, mask_path: null }
        : {};

      return {
        type: "Detection",
        data: {
          ...data,
          ...maskData,
        } as DetectionLabel,
        boundingBox,
        path: overlay.field,
      };
    }
  } else if (overlay instanceof ClassificationOverlay) {
    const label = overlay.label as ClassificationLabel;

    return {
      type: "Classification",
      data: label,
      path: overlay.field,
    };
  } else if (overlay instanceof PolylineOverlay) {
    // Must be checked before KeypointOverlay, since PolylineOverlay extends it.
    const label = overlay.label as unknown as PolylineLabel;

    return {
      type: "Polyline",
      data: {
        ...label,
        points: overlay.getNestedPoints(),
        closed: overlay.getClosed(),
        filled: overlay.getFilled(),
      } as PolylineLabel,
      path: overlay.field,
    };
  } else if (overlay instanceof KeypointOverlay) {
    const label = overlay.label as KeypointLabel;

    return {
      type: "Keypoint",
      data: label,
      path: overlay.field,
    };
  }

  return undefined;
};
