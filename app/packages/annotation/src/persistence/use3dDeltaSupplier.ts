import type { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";
import {
  ReconciledDetection3D,
  ReconciledPolyline3D,
  useReconciledLabels3D,
} from "@fiftyone/looker-3d";
import type { JSONDeltas } from "@fiftyone/core";
import { useGetLabelDelta } from "./useGetLabelDelta";
import { DetectionLabel } from "@fiftyone/looker";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { LabelProxy } from "../deltas";

/**
 * List of attributes which are used for internal annotation functionality.
 *
 * These attributes should *not* be persisted to the sample and are stripped
 * before calculating a delta.
 */
const reservedAttributes = [
  "color",
  "id",
  "isNew",
  "path",
  "selected",
  "sampleId",
  "type",
];

/**
 * Omit a set of keys from an object.
 *
 * @param data Object to modify
 * @param keys List of keys to omit
 */
const omit = <T, K extends keyof T>(data: T, ...keys: K[]): Omit<T, K> => {
  const result = { ...data };
  keys.forEach((key) => delete result[key]);
  return result as Omit<T, K>;
};

/**
 * Build a {@link LabelProxy} instance from a reconciled 3d label.
 *
 * @param label Reconciled 3d label
 */
const buildAnnotationLabel = (
  label: ReconciledDetection3D | ReconciledPolyline3D
): LabelProxy | undefined => {
  if (label._cls === "Detection" && label.label) {
    return {
      type: "Detection",
      data: omit(label, ...reservedAttributes) as DetectionLabel,
      path: label.path,
    };
  } else if (label._cls === "Polyline" && label.label) {
    return {
      type: "Polyline",
      data: omit(label, ...reservedAttributes) as PolylineLabel,
      path: label.path,
    };
  }
};

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the 3D annotation context.
 */
export const use3dDeltaSupplier = (): DeltaSupplier => {
  const labels = useReconciledLabels3D();
  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);

  return useCallback(() => {
    const sampleDeltas: JSONDeltas = [];

    labels?.detections?.forEach((detection) => {
      sampleDeltas.push(...getLabelDelta(detection, detection.path));
    });
    labels?.polylines?.forEach((polyline) => {
      sampleDeltas.push(...getLabelDelta(polyline, polyline.path));
    });

    return sampleDeltas;
  }, [getLabelDelta, labels]);
};
