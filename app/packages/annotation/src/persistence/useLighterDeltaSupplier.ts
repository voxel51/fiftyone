import { DeltaSupplier } from "./deltaSupplier";
import { buildJsonPath, buildLabelDeltas, getFieldSchema } from "../deltas";
import {
  BaseOverlay,
  BoundingBoxOverlay,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import type { JSONDeltas } from "@fiftyone/core";
import {
  AnnotationLabel,
  useModalSample,
  useModalSampleSchema,
} from "@fiftyone/state";
import { DetectionLabel } from "@fiftyone/looker";
import { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";

const buildAnnotationLabel = (
  overlay: BaseOverlay
): AnnotationLabel | undefined => {
  if (overlay instanceof BoundingBoxOverlay && overlay.label.label) {
    return {
      type: "Detection",
      data: overlay.label as DetectionLabel,
      overlay,
      path: overlay.field,
    };
  } else if (overlay instanceof ClassificationOverlay && overlay.label.label) {
    return {
      type: "Classification",
      data: overlay.label as ClassificationLabel,
      overlay,
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
  const modalSample = useModalSample();
  const modalSampleSchema = useModalSampleSchema();

  return useCallback(() => {
    const sampleDeltas: JSONDeltas = [];

    scene?.getAllOverlays().forEach((overlay) => {
      const annotationLabel = buildAnnotationLabel(overlay);
      if (annotationLabel) {
        const labelDeltas = buildLabelDeltas(
          modalSample.sample,
          annotationLabel,
          getFieldSchema(modalSampleSchema, overlay.field),
          "mutate"
        );

        if (labelDeltas?.length > 0) {
          sampleDeltas.push(
            ...labelDeltas.map((delta) => ({
              ...delta,
              // convert label delta to sample delta
              path: buildJsonPath(overlay.field, delta.path),
            }))
          );
        }
      }
    });

    return sampleDeltas;
  }, [modalSample.sample, modalSampleSchema, scene]);
};
