import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import type {
  ReconciledDetection3D3D,
  ReconciledLabels3D3D,
  ReconciledPolyline3D3D,
} from "../annotation/types";
import type { OverlayLabel } from "../labels/loader";
import type { PolyLineProps } from "../labels/polyline";
import {
  createNewDetection,
  createNewPolyline,
  reconcileDetection,
  reconcilePolyline,
} from "../labels/merge-utils";
import {
  currentActiveAnnotationField3dAtom,
  reconciledLabels3DSelector,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
} from "../state";

interface UseReconciledLabels3DParams {
  rawOverlays: OverlayLabel[];
}

/**
 * Hook that computes reconciled labels by combining raw overlay data
 * with staged transforms.
 *
 * This hook:
 * 1. Takes raw overlays as input
 * 2. Reconciles them with staged transforms from state
 * 3. Creates labels for newly created items (in staged transforms only)
 * 4. Updates a public selector for downstream consumers
 * 5. Returns the reconciled labels for immediate use in rendering
 *
 * @param params.rawOverlays - The raw overlay data loaded from sample
 * @returns ReconciledLabels3D containing separate arrays for detections and polylines
 */
export function useReconciledLabels3D({
  rawOverlays,
}: UseReconciledLabels3DParams): ReconciledLabels3D3D {
  const stagedPolylineTransforms = useRecoilValue(stagedPolylineTransformsAtom);
  const stagedCuboidTransforms = useRecoilValue(stagedCuboidTransformsAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const setReconciledLabels3D = useSetRecoilState(reconciledLabels3DSelector);

  const reconciledLabels3D = useMemo(() => {
    const detections: ReconciledDetection3D3D[] = [];
    const polylines: ReconciledPolyline3D3D[] = [];

    // Track existing IDs to identify new labels from staged transforms
    const existingPolylineIds = new Set<string>();
    const existingDetectionIds = new Set<string>();

    // Process existing overlays with staged transforms
    for (const overlay of rawOverlays) {
      if (
        overlay._cls === "Detection" &&
        (overlay as unknown as ReconciledDetection3D3D).dimensions &&
        (overlay as unknown as ReconciledDetection3D3D).location
      ) {
        existingDetectionIds.add(overlay._id);

        const reconciled = reconcileDetection(
          overlay,
          stagedCuboidTransforms?.[overlay._id]
        );
        detections.push(reconciled);
      } else if (
        overlay._cls === "Polyline" &&
        (overlay as unknown as PolyLineProps).points3d
      ) {
        existingPolylineIds.add(overlay._id);

        const reconciled = reconcilePolyline(
          overlay as OverlayLabel & { points3d: [number, number, number][][] },
          stagedPolylineTransforms?.[overlay._id]
        );

        // Only include polylines with valid points
        if (reconciled.points3d && reconciled.points3d.length > 0) {
          polylines.push(reconciled);
        }
      }
    }

    // Create labels for NEW polylines that exist only in staged transforms
    for (const [labelId, transformData] of Object.entries(
      stagedPolylineTransforms ?? {}
    )) {
      // Skip if already processed as existing label
      if (existingPolylineIds.has(labelId)) {
        continue;
      }

      // Only process transforms for the current sample
      if (transformData.sampleId !== currentSampleId) {
        continue;
      }

      const newLabel = createNewPolyline(
        labelId,
        transformData,
        currentSampleId
      );

      if (newLabel) {
        polylines.push(newLabel);
      }
    }

    // Create labels for NEW detections that exist only in staged transforms
    for (const [labelId, transformData] of Object.entries(
      stagedCuboidTransforms ?? {}
    )) {
      // Skip if already processed as existing label
      if (existingDetectionIds.has(labelId)) {
        continue;
      }

      // Skip if missing required data
      if (!transformData.location || !transformData.dimensions) {
        continue;
      }

      const newLabel = createNewDetection(
        labelId,
        transformData,
        currentSampleId,
        currentActiveField || ""
      );

      detections.push(newLabel);
    }

    return {
      detections,
      polylines,
    };
  }, [
    rawOverlays,
    stagedPolylineTransforms,
    stagedCuboidTransforms,
    currentSampleId,
    currentActiveField,
  ]);

  // Sync reconciled labels to state for downstream consumers
  useEffect(() => {
    setReconciledLabels3D(reconciledLabels3D);
  }, [reconciledLabels3D, setReconciledLabels3D]);

  return reconciledLabels3D;
}
