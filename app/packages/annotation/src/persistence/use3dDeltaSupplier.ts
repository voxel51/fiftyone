import type { JSONDeltas } from "@fiftyone/core";
import { DetectionLabel } from "@fiftyone/looker";
import {
  ReconciledDetection3D,
  ReconciledPolyline3D,
  useDeletedWorkingLabels,
  useIsDragInProgress,
  useWorkingDetections,
  useWorkingPolylines,
} from "@fiftyone/looker-3d";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { useCallback } from "react";
import { LabelProxy } from "../deltas";
import type { DeltaSupplier } from "./deltaSupplier";
import { useGetLabelDelta } from "./useGetLabelDelta";

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
 * @param requireLabel If true, only build proxy if label has a label value.
 *   Used for mutations to avoid persisting incomplete labels.
 */
const buildAnnotationLabel = (
  label: ReconciledDetection3D | ReconciledPolyline3D,
  requireLabel = true
): LabelProxy | undefined => {
  if (label._cls === "Detection" && (!requireLabel || label.label)) {
    return {
      type: "Detection",
      data: omit(label, ...reservedAttributes) as DetectionLabel,
      path: label.path,
    };
  } else if (label._cls === "Polyline" && (!requireLabel || label.label)) {
    return {
      type: "Polyline",
      data: omit(label, ...reservedAttributes) as PolylineLabel,
      path: label.path,
    };
  }
};

/**
 * Build a {@link LabelProxy} for deletions
 */
const buildAnnotationLabelForDelete = (
  label: ReconciledDetection3D | ReconciledPolyline3D
): LabelProxy | undefined => {
  return buildAnnotationLabel(label, false);
};

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the 3D annotation context.
 *
 * The approach is:
 * - Read from the working store (committed edits) (See looker-3d/src/annotation/store/index.ts)
 * - Guard against computing deltas during active drag operations
 * - Compute mutation deltas for modified labels
 * - Compute deletion deltas for deleted labels (that existed in baseline)
 */
export const use3dDeltaSupplier = (): DeltaSupplier => {
  const detections = useWorkingDetections();
  const polylines = useWorkingPolylines();
  const deletedLabels = useDeletedWorkingLabels();

  const dragInProgress = useIsDragInProgress();

  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);
  const getLabelDeleteDelta = useGetLabelDelta(buildAnnotationLabelForDelete, {
    opType: "delete",
  });

  return useCallback(() => {
    // Guard: don't compute deltas during active drag
    // This prevents intermediate states from being persisted
    if (dragInProgress) {
      return { deltas: [] };
    }

    const sampleDeltas: JSONDeltas = [];

    // Generate mutation deltas for non-deleted labels
    detections.forEach((detection) => {
      sampleDeltas.push(...getLabelDelta(detection, detection.path));
    });

    polylines.forEach((polyline) => {
      sampleDeltas.push(...getLabelDelta(polyline, polyline.path));
    });

    // Generate deletion deltas for deleted labels
    // Only for labels that existed in baseline
    deletedLabels.forEach((label) => {
      if (label._cls === "Detection" || label._cls === "Polyline") {
        sampleDeltas.push(...getLabelDeleteDelta(label, label.path));
      }
    });

    return { deltas: sampleDeltas };
  }, [
    getLabelDelta,
    getLabelDeleteDelta,
    detections,
    polylines,
    deletedLabels,
    dragInProgress,
  ]);
};
