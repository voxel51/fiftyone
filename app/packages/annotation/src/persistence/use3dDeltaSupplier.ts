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

// Runtime/UI-only fields the annotation layer attaches to a working label;
// persisting them would corrupt the stored label, so they are stripped before
// a delta is built.
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
  return undefined;
};

/**
 * Captures the 3D annotation context's edits as deltas. It reads the working
 * store's *committed* edits rather than live drag state, so a flush never
 * persists an intermediate position (see looker-3d/src/annotation/store).
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
    // Mid-drag positions are intermediate and must not be persisted.
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
