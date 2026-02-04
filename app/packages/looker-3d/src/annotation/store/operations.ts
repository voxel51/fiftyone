import { KnownContexts, usePushUndoable } from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { DETECTION, POLYLINE } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { isDetection, isPolyline } from "../../types";
import type {
  CuboidTransformData,
  PolylinePointTransformData,
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../types";
import { roundTuple } from "../utils/rounding-utils";
import { useEndDrag } from "./transient";
import type {
  LabelId,
  TransientCuboidState,
  TransientPolylineState,
} from "./types";
import {
  useAddWorkingLabel,
  useDeleteWorkingLabel,
  useRestoreWorkingLabel,
  useUpdateWorkingLabel,
  workingAtom,
} from "./working";

// =============================================================================
// CUBOID OPERATIONS
// =============================================================================

/**
 * Hook that provides operations for manipulating cuboids in the working store.
 * All operations are undoable and integrate with the undo system.
 */
export function useCuboidOperations() {
  const { createPushAndExec } = usePushUndoable(KnownContexts.ModalAnnotate);
  const updateLabel = useUpdateWorkingLabel();
  const addLabel = useAddWorkingLabel();
  const deleteLabel = useDeleteWorkingLabel();
  const restoreLabel = useRestoreWorkingLabel();
  const endDrag = useEndDrag();
  const currentSampleId = useRecoilValue(fos.currentSampleId);

  /**
   * Updates cuboid properties.
   * This is the core undoable operation - all cuboid modifications should
   * go through this to ensure proper undo/redo support.
   */
  const updateCuboid = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId, updates: Partial<ReconciledDetection3D>) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isDetection(existingLabel)) {
          return;
        }

        // Dynamically capture only the fields being updated for undo
        const previousState: Partial<ReconciledDetection3D> = {};
        for (const key of Object.keys(updates) as Array<
          keyof ReconciledDetection3D
        >) {
          if (key in existingLabel) {
            (previousState as Record<string, unknown>)[key] =
              existingLabel[key];
          }
        }

        const roundedUpdates: Partial<ReconciledDetection3D> = { ...updates };
        if (updates.location) {
          roundedUpdates.location = roundTuple(updates.location);
        }
        if (updates.dimensions) {
          roundedUpdates.dimensions = roundTuple(updates.dimensions);
        }
        if (updates.rotation) {
          roundedUpdates.rotation = roundTuple(updates.rotation);
        }
        if (updates.quaternion) {
          roundedUpdates.quaternion = roundTuple(updates.quaternion);
        }

        const execFn = () => {
          updateLabel(labelId, roundedUpdates);
        };

        const undoFn = () => {
          updateLabel(labelId, previousState);
        };

        createPushAndExec(`cuboid-update-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, updateLabel]
  );

  /**
   * Finalizes a drag operation on a cuboid. Called on pointer-up after
   * using TransformControls. Applies transient deltas to working store
   * and clears transient state.
   */
  const finalizeCuboidDrag = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId, transient: TransientCuboidState) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isDetection(existingLabel)) {
          return;
        }

        const newState: Partial<ReconciledDetection3D> = {};

        if (transient.positionDelta) {
          newState.location = [
            existingLabel.location[0] + transient.positionDelta[0],
            existingLabel.location[1] + transient.positionDelta[1],
            existingLabel.location[2] + transient.positionDelta[2],
          ];
        }

        if (transient.dimensionsDelta) {
          newState.dimensions = [
            existingLabel.dimensions[0] + transient.dimensionsDelta[0],
            existingLabel.dimensions[1] + transient.dimensionsDelta[1],
            existingLabel.dimensions[2] + transient.dimensionsDelta[2],
          ];
        }

        if (transient.quaternionOverride) {
          newState.quaternion = transient.quaternionOverride;
          // Clear rotation since quaternion is authoritative
          newState.rotation = undefined;
        }

        await updateCuboid(labelId, newState);
        endDrag(labelId);
      },
    [updateCuboid, endDrag]
  );

  /**
   * Creates a new cuboid label and adds it to the working store.
   */
  const createCuboid = useCallback(
    (labelId: LabelId, data: CuboidTransformData, path: string) => {
      if (!currentSampleId) return;

      const newLabel: ReconciledDetection3D = {
        _id: labelId,
        _cls: DETECTION,
        type: DETECTION,
        path,
        location: roundTuple(data.location),
        dimensions: roundTuple(data.dimensions),
        rotation: data.rotation ? roundTuple(data.rotation) : [0, 0, 0],
        quaternion: data.quaternion ? roundTuple(data.quaternion) : undefined,
        sampleId: currentSampleId,
        tags: [],
        isNew: true,
      };

      const execFn = () => {
        addLabel(newLabel);
      };

      const undoFn = () => {
        deleteLabel(labelId);
      };

      createPushAndExec(`create-cuboid-${labelId}`, execFn, undoFn);
    },
    [createPushAndExec, addLabel, deleteLabel, currentSampleId]
  );

  /**
   * Deletes a cuboid label from the working store.
   */
  const deleteCuboid = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isDetection(existingLabel)) {
          return;
        }

        const execFn = () => {
          deleteLabel(labelId);
        };

        const undoFn = () => {
          restoreLabel(labelId);
        };

        createPushAndExec(`delete-cuboid-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, deleteLabel, restoreLabel]
  );

  return {
    finalizeCuboidDrag,
    updateCuboid,
    createCuboid,
    deleteCuboid,
  };
}

// =============================================================================
// POLYLINE OPERATIONS
// =============================================================================

/**
 * Hook that provides operations for manipulating polylines in the working store.
 * All operations are undoable and integrate with the undo system.
 */
export function usePolylineOperations() {
  const { createPushAndExec } = usePushUndoable(KnownContexts.ModalAnnotate);
  const updateLabel = useUpdateWorkingLabel();
  const addLabel = useAddWorkingLabel();
  const deleteLabel = useDeleteWorkingLabel();
  const restoreLabel = useRestoreWorkingLabel();
  const endDrag = useEndDrag();
  const currentSampleId = useRecoilValue(fos.currentSampleId);

  /**
   * Updates polyline properties.
   * This is the core undoable operation - all polyline modifications should
   * go through this to ensure proper undo/redo support.
   */
  const updatePolyline = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId, updates: Partial<ReconciledPolyline3D>) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isPolyline(existingLabel)) {
          return;
        }

        // Dynamically capture only the fields being updated for undo
        const previousState: Partial<ReconciledPolyline3D> = {};
        for (const key of Object.keys(updates) as Array<
          keyof ReconciledPolyline3D
        >) {
          if (key in existingLabel) {
            (previousState as Record<string, unknown>)[key] =
              existingLabel[key];
          }
        }

        const roundedUpdates: Partial<ReconciledPolyline3D> = { ...updates };
        if (updates.points3d) {
          roundedUpdates.points3d = updates.points3d.map((segment) =>
            segment.map(
              (point) => roundTuple(point) as [number, number, number]
            )
          );
        }

        const execFn = () => {
          updateLabel(labelId, roundedUpdates);
        };

        const undoFn = () => {
          updateLabel(labelId, previousState);
        };

        createPushAndExec(`polyline-update-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, updateLabel]
  );

  /**
   * Finalizes a drag operation on a polyline. Called on pointer-up after
   * using TransformControls. Applies transient deltas to working store
   * and clears transient state.
   */
  const finalizePolylineDrag = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId, transient: TransientPolylineState) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isPolyline(existingLabel)) {
          return;
        }

        // Compute new points3d from working + transient deltas
        let newPoints3d = existingLabel.points3d;

        if (transient.positionDelta) {
          const delta = transient.positionDelta;
          newPoints3d = newPoints3d.map((segment) =>
            segment.map(
              (point) =>
                [
                  point[0] + delta[0],
                  point[1] + delta[1],
                  point[2] + delta[2],
                ] as [number, number, number]
            )
          );
        }

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

        await updatePolyline(labelId, { points3d: newPoints3d });
        endDrag(labelId);
      },
    [updatePolyline, endDrag]
  );

  /**
   * Updates polyline points directly.
   */
  const updatePolylinePoints = useCallback(
    (labelId: LabelId, newPoints3d: [number, number, number][][]) => {
      return updatePolyline(labelId, { points3d: newPoints3d });
    },
    [updatePolyline]
  );

  /**
   * Creates a new polyline label and adds it to the working store.
   */
  const createPolyline = useCallback(
    (labelId: LabelId, data: PolylinePointTransformData, path: string) => {
      if (!currentSampleId) return;

      const points3d = data.segments.map((seg) =>
        seg.points.map((pt) => roundTuple(pt) as [number, number, number])
      );

      const newLabel: ReconciledPolyline3D = {
        _id: labelId,
        _cls: POLYLINE,
        type: POLYLINE,
        path,
        label: data.label ?? "",
        points3d,
        sampleId: currentSampleId,
        tags: [],
        isNew: true,
        ...(data.misc ?? {}),
      };

      const execFn = () => {
        addLabel(newLabel);
      };

      const undoFn = () => {
        deleteLabel(labelId);
      };

      createPushAndExec(`create-polyline-${labelId}`, execFn, undoFn);
    },
    [createPushAndExec, addLabel, deleteLabel, currentSampleId]
  );

  /**
   * Deletes a polyline label from the working store.
   */
  const deletePolyline = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isPolyline(existingLabel)) {
          return;
        }

        const execFn = () => {
          deleteLabel(labelId);
        };

        const undoFn = () => {
          restoreLabel(labelId);
        };

        createPushAndExec(`delete-polyline-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, deleteLabel, restoreLabel]
  );

  return {
    finalizePolylineDrag,
    updatePolylinePoints,
    updatePolyline,
    createPolyline,
    deletePolyline,
  };
}
