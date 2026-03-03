import type { DeltaSupplier } from "./deltaSupplier";
import {
  type BaseOverlay,
  BoundingBoxOverlay,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { useGetLabelDelta } from "./useGetLabelDelta";
import { buildAnnotationPath, type LabelProxy } from "../deltas";
import { hasValidBounds } from "@fiftyone/utilities";
import { BoundingBox } from "@fiftyone/looker/src/state";
import { useRecoilValue } from "recoil";
import { isGeneratedView, isPatchesView } from "@fiftyone/state";

/**
 * Build a {@link LabelProxy} instance from a lighter overlay.
 *
 * @param overlay Lighter overlay
 */
const buildAnnotationLabel = (overlay: BaseOverlay): LabelProxy | undefined => {
  if (overlay instanceof BoundingBoxOverlay && overlay.label.label) {
    const bounds = overlay.getRelativeBounds();
    const boundingBox: BoundingBox = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (hasValidBounds(boundingBox)) {
      return {
        type: "Detection",
        data: overlay.label as DetectionLabel,
        boundingBox,
        path: overlay.field,
      };
    }
  } else if (overlay instanceof ClassificationOverlay) {
    const label = overlay.label as ClassificationLabel;
    if (label.label) {
      return {
        type: "Classification",
        data: label,
        path: overlay.field,
      };
    }
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
