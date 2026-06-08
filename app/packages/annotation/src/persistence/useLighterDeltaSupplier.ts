import {
  type BaseOverlay,
  DetectionOverlay,
  ClassificationOverlay,
  KeypointOverlay,
  type KeypointLabel,
  PolylineOverlay,
  useLighter,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { BoundingBox } from "@fiftyone/looker/src/state";
import { isPatchesView } from "@fiftyone/state";
import { hasValidBounds } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import type { LabelProxy } from "../deltas";
import { buildAnnotationPath } from "../deltas";
import type { DeltaSupplier } from "./deltaSupplier";
import { useGetLabelDelta } from "./useGetLabelDelta";

/**
 * Build a {@link LabelProxy} instance from a lighter overlay.
 *
 * @param overlay Lighter overlay
 */
const buildAnnotationLabel = (overlay: BaseOverlay): LabelProxy | undefined => {
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
};

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the Lighter annotation context.
 */
export const useLighterDeltaSupplier = (): DeltaSupplier => {
  const { scene } = useLighter();
  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);
  const isPatches = useRecoilValue(isPatchesView);

  return useCallback(() => {
    const overlays = scene?.getAllOverlays() ?? [];
    const allDeltas: ReturnType<typeof getLabelDelta> = [];
    let firstChangedOverlay: BaseOverlay | undefined;

    for (const overlay of overlays) {
      const deltas = getLabelDelta(overlay, overlay.field);
      if (deltas.length > 0) {
        allDeltas.push(...deltas);
        if (!firstChangedOverlay) {
          firstChangedOverlay = overlay;
        }
      }
    }

    // Must include additional metadata for all generated views so the backend can
    // update the source data as well.
    // Note: Only supported for patches views currently
    let metadata;
    if (isPatches && firstChangedOverlay) {
      // Patches views by definition are flattened detections fields so updates
      // will always be single label
      const labelProxy = buildAnnotationLabel(firstChangedOverlay);
      if (labelProxy) {
        metadata = {
          labelId: firstChangedOverlay.id,
          labelPath: buildAnnotationPath(labelProxy, isPatches),
        };
      }
    }

    return { deltas: allDeltas, metadata };
  }, [getLabelDelta, isPatches, scene]);
};
