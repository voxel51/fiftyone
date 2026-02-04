import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { selector, useRecoilValue } from "recoil";
import { isDetection, isPolyline } from "../../types";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import { transientAtom } from "./transient";
import type {
  LabelId,
  RenderModel,
  TransientCuboidState,
  TransientPolylineState,
  TransientStore,
  WorkingDoc,
} from "./types";
import { workingAtom, workingDocSelector } from "./working";

/**
 * Applies transient cuboid state to a detection label.
 * Returns a new detection with transient transformations applied.
 */
export function applyTransientToCuboid(
  detection: ReconciledDetection3D,
  transient: TransientCuboidState | undefined
): ReconciledDetection3D {
  if (!transient) {
    return detection;
  }

  let result = { ...detection };

  if (transient.positionDelta) {
    result.location = [
      detection.location[0] + transient.positionDelta[0],
      detection.location[1] + transient.positionDelta[1],
      detection.location[2] + transient.positionDelta[2],
    ];
  }

  // Dimensions delta - multiplicative for scale
  if (transient.dimensionsDelta) {
    result.dimensions = [
      detection.dimensions[0] + transient.dimensionsDelta[0],
      detection.dimensions[1] + transient.dimensionsDelta[1],
      detection.dimensions[2] + transient.dimensionsDelta[2],
    ];
  }

  if (transient.quaternionOverride) {
    result.quaternion = transient.quaternionOverride;
  }

  return result;
}

/**
 * Applies transient polyline state to a polyline label.
 * Returns a new polyline with transient transformations applied.
 */
export function applyTransientToPolyline(
  polyline: ReconciledPolyline3D,
  transient: TransientPolylineState | undefined
): ReconciledPolyline3D {
  if (!transient) {
    return polyline;
  }

  let newPoints3d = polyline.points3d;

  // Apply position delta to all vertices
  if (transient.positionDelta) {
    const delta = transient.positionDelta;
    newPoints3d = newPoints3d.map((segment) =>
      segment.map((point) => [
        point[0] + delta[0],
        point[1] + delta[1],
        point[2] + delta[2],
      ])
    );
  }

  // Apply individual vertex deltas
  if (transient.vertexDeltas) {
    newPoints3d = newPoints3d.map((segment, segIdx) =>
      segment.map((point, ptIdx) => {
        const key = `${segIdx}-${ptIdx}`;
        const delta = transient.vertexDeltas?.[key];
        if (delta) {
          return [
            point[0] + delta[0],
            point[1] + delta[1],
            point[2] + delta[2],
          ];
        }
        return point;
      })
    );
  }

  return {
    ...polyline,
    points3d: newPoints3d,
  };
}

/**
 * Function that derives the render model from working doc and transient store.
 *
 * renderModel = derive(working.doc, transient)
 *
 * @param workingDoc - The working document containing committed labels
 * @param transient - The transient store containing ephemeral interaction state
 * @returns The render model with all transformations applied
 */
export function deriveRenderModel(
  workingDoc: WorkingDoc,
  transient: TransientStore
): RenderModel {
  const detections: ReconciledDetection3D[] = [];
  const polylines: ReconciledPolyline3D[] = [];

  for (const [labelId, label] of Object.entries(workingDoc.labelsById)) {
    // Skip deleted labels
    if (workingDoc.deletedIds.has(labelId)) {
      continue;
    }

    if (isDetection(label)) {
      const withTransient = applyTransientToCuboid(
        label,
        transient.cuboids[labelId]
      );
      detections.push(withTransient);
    } else if (isPolyline(label)) {
      const withTransient = applyTransientToPolyline(
        label,
        transient.polylines[labelId]
      );
      polylines.push(withTransient);
    }
  }

  return { detections, polylines };
}

// =============================================================================
// RECOIL SELECTORS
// =============================================================================

/**
 * Selector that computes the render model from working and transient stores.
 * This is the primary selector for rendering labels in annotate mode.
 */
export const renderModelSelector = selector<RenderModel>({
  key: "fo3d-renderModel",
  get: ({ get }) => {
    const workingDoc = get(workingDocSelector);
    const transient = get(transientAtom);

    return deriveRenderModel(workingDoc, transient);
  },
});

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook that returns the render model for the current mode.
 *
 * - In explore mode: Returns empty model (rendering uses loader directly)
 * - In annotate mode: Returns derived model from working + transient
 *
 * @returns The render model for current mode
 */
export function useRenderModel(): RenderModel {
  const mode = useAtomValue(fos.modalMode);
  const renderModel = useRecoilValue(renderModelSelector);

  // In explore mode, we return an empty model since rendering
  // uses the loader directly via ThreeDLabels
  if (mode !== "annotate") {
    return { detections: [], polylines: [] };
  }

  return renderModel;
}

/**
 * Hook that returns a specific detection from the render model.
 */
export function useRenderDetection(
  labelId: LabelId
): ReconciledDetection3D | undefined {
  const renderModel = useRenderModel();

  return useMemo(
    () => renderModel.detections.find((d) => d._id === labelId),
    [renderModel.detections, labelId]
  );
}

/**
 * Hook that returns a specific polyline from the render model.
 */
export function useRenderPolyline(
  labelId: LabelId
): ReconciledPolyline3D | undefined {
  const renderModel = useRenderModel();

  return useMemo(
    () => renderModel.polylines.find((p) => p._id === labelId),
    [renderModel.polylines, labelId]
  );
}

/**
 * Hook that returns whether the working store is initialized.
 */
export function useIsWorkingInitialized(): boolean {
  const workingState = useRecoilValue(workingAtom);
  return workingState.initialized;
}
