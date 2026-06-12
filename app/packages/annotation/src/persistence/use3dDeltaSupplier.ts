import { DetectionLabel } from "@fiftyone/looker";
import {
  ReconciledDetection3D,
  ReconciledPolyline3D,
  useDeletedWorkingLabels,
  useIsDragInProgress,
  useWorkingDetections,
  useWorkingPolylines,
} from "@fiftyone/looker-3d";
import { isDetection, isPolyline } from "@fiftyone/looker-3d/src/types";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { useCallback } from "react";
import type { LabelFieldDelta, LabelProxy } from "../deltas";
import type { DeltaSupplier } from "./deltaSupplier";
import { useGetLabelDelta } from "./useGetLabelDelta";

/**
 * Attributes used for internal annotation functionality that must not be
 * persisted; they are stripped before capturing a delta.
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

const omit = <T, K extends keyof T>(data: T, ...keys: K[]): Omit<T, K> => {
  const result = { ...data };
  keys.forEach((key) => delete result[key]);
  return result as Omit<T, K>;
};

/**
 * Build a {@link LabelProxy} from a reconciled 3d label.
 */
const buildAnnotationLabel = (
  label: ReconciledDetection3D | ReconciledPolyline3D
): LabelProxy | undefined => {
  if (label._cls === "Detection") {
    return {
      type: "Detection",
      data: omit(label, ...reservedAttributes) as DetectionLabel,
      path: label.path,
    };
  } else if (label._cls === "Polyline") {
    return {
      type: "Polyline",
      data: omit(label, ...reservedAttributes) as PolylineLabel,
      path: label.path,
    };
  }
};

/**
 * Hook which provides a {@link DeltaSupplier} capturing deltas isolated to
 * the 3D annotation context.
 */
export const use3dDeltaSupplier = (): DeltaSupplier => {
  const detections = useWorkingDetections();
  const polylines = useWorkingPolylines();
  const deletedLabels = useDeletedWorkingLabels();

  const dragInProgress = useIsDragInProgress();

  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);
  const getLabelDeleteDelta = useGetLabelDelta(buildAnnotationLabel, {
    opType: "delete",
  });

  return useCallback(() => {
    // Don't capture intermediate state mid-drag.
    if (dragInProgress) {
      return { deltas: [] };
    }

    const deltas: LabelFieldDelta[] = [];
    const push = (delta: LabelFieldDelta | null) => {
      if (delta) deltas.push(delta);
    };

    detections.forEach((d) => push(getLabelDelta(d, d.path)));
    polylines.forEach((p) => push(getLabelDelta(p, p.path)));
    deletedLabels.forEach((label) => {
      if (isDetection(label) || isPolyline(label)) {
        push(getLabelDeleteDelta(label, label.path));
      }
    });

    return { deltas };
  }, [
    getLabelDelta,
    getLabelDeleteDelta,
    detections,
    polylines,
    deletedLabels,
    dragInProgress,
  ]);
};
