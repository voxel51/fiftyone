import type { DeltaSupplier } from "./deltaSupplier";
import {
  type BaseOverlay,
  BoundingBoxOverlay,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import type { JSONDeltas } from "@fiftyone/core";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { useGetLabelDelta } from "./useGetLabelDelta";
import type { LabelProxy } from "../deltas";

/**
 * Build a {@link LabelProxy} instance from a reconciled 3d label.
 *
 * @param overlay Lighter overlay
 */
const buildAnnotationLabel = (overlay: BaseOverlay): LabelProxy | undefined => {
  if (overlay instanceof BoundingBoxOverlay && overlay.label.label) {
    const bounds = overlay.getRelativeBounds();
    return {
      type: "Detection",
      data: overlay.label as DetectionLabel,
      boundingBox: [bounds.x, bounds.y, bounds.width, bounds.height],
      path: overlay.field,
    };
  } else if (overlay instanceof ClassificationOverlay && overlay.label.label) {
    return {
      type: "Classification",
      data: overlay.label as ClassificationLabel,
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

  return useCallback(() => {
    const sampleDeltas: JSONDeltas = [];

    scene?.getAllOverlays()?.forEach((overlay) => {
      sampleDeltas.push(...getLabelDelta(overlay, overlay.field));
    });

    return sampleDeltas;
  }, [getLabelDelta, scene]);
};
