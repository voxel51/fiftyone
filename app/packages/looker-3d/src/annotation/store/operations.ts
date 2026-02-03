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
   * Commits a cuboid transformation from transient state to working store.
   */
  const commitCuboidTransform = useRecoilCallback(
    ({ snapshot }) =>
      async (
        labelId: LabelId,
        transient: TransientCuboidState,
        previousState: CuboidTransformData
      ) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isDetection(existingLabel)) {
          return;
        }

        // New state is a function of working + transient
        let newLocation = existingLabel.location;
        let newDimensions = existingLabel.dimensions;
        let newQuaternion = existingLabel.quaternion;

        if (transient.positionDelta) {
          newLocation = roundTuple([
            existingLabel.location[0] + transient.positionDelta[0],
            existingLabel.location[1] + transient.positionDelta[1],
            existingLabel.location[2] + transient.positionDelta[2],
          ]);
        }

        if (transient.dimensionsDelta) {
          newDimensions = roundTuple([
            existingLabel.dimensions[0] + transient.dimensionsDelta[0],
            existingLabel.dimensions[1] + transient.dimensionsDelta[1],
            existingLabel.dimensions[2] + transient.dimensionsDelta[2],
          ]);
        }

        if (transient.quaternionOverride) {
          newQuaternion = roundTuple(transient.quaternionOverride);
        }

        const newState: Partial<ReconciledDetection3D> = {
          location: newLocation,
          dimensions: newDimensions,
          quaternion: newQuaternion,
          // Clear rotation since quaternion is authoritative
          // Todo: we can't... actually we need to store .rotation too since legacy customers use .rotation as well
          rotation: undefined,
        };

        const execFn = () => {
          updateLabel(labelId, newState);
          endDrag(labelId);
        };

        const undoFn = () => {
          updateLabel(labelId, {
            location: previousState.location,
            dimensions: previousState.dimensions,
            quaternion: previousState.quaternion,
            rotation: previousState.rotation,
          });
        };

        createPushAndExec(`cuboid-transform-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, updateLabel, endDrag]
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
    commitCuboidTransform,
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
   * Commits a polyline transformation from transient state to working store.
   * Called on pointer-up after a drag operation.
   */
  const commitPolylineTransform = useRecoilCallback(
    ({ snapshot }) =>
      async (
        labelId: LabelId,
        transient: TransientPolylineState,
        previousPoints3d: [number, number, number][][]
      ) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isPolyline(existingLabel)) {
          return;
        }

        // Compute the new points3d from working + transient
        let newPoints3d = existingLabel.points3d;

        if (transient.positionDelta) {
          const delta = transient.positionDelta;
          newPoints3d = newPoints3d.map((segment) =>
            segment.map(
              (point) =>
                roundTuple([
                  point[0] + delta[0],
                  point[1] + delta[1],
                  point[2] + delta[2],
                ]) as [number, number, number]
            )
          );
        }

        if (transient.vertexDeltas) {
          newPoints3d = newPoints3d.map((segment, segIdx) =>
            segment.map((point, ptIdx) => {
              const key = `${segIdx}-${ptIdx}`;
              const delta = transient.vertexDeltas?.[key];
              if (delta) {
                return roundTuple([
                  point[0] + delta[0],
                  point[1] + delta[1],
                  point[2] + delta[2],
                ]) as [number, number, number];
              }
              return point;
            })
          );
        }

        const execFn = () => {
          updateLabel(labelId, { points3d: newPoints3d });
          endDrag(labelId);
        };

        const undoFn = () => {
          updateLabel(labelId, { points3d: previousPoints3d });
        };

        createPushAndExec(`polyline-transform-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, updateLabel, endDrag]
  );

  /**
   * Updates polyline points directly (for vertex editing, segment insertion, etc.).
   */
  const updatePolylinePoints = useRecoilCallback(
    ({ snapshot }) =>
      async (labelId: LabelId, newPoints3d: [number, number, number][][]) => {
        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[labelId];

        if (!existingLabel || !isPolyline(existingLabel)) {
          return;
        }

        const previousPoints3d = existingLabel.points3d;

        const execFn = () => {
          updateLabel(labelId, {
            points3d: newPoints3d.map((seg) => seg.map((pt) => roundTuple(pt))),
          });
          endDrag(labelId);
        };

        const undoFn = () => {
          updateLabel(labelId, { points3d: previousPoints3d });
        };

        createPushAndExec(`update-polyline-${labelId}`, execFn, undoFn);
      },
    [createPushAndExec, updateLabel]
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
    commitPolylineTransform,
    updatePolylinePoints,
    createPolyline,
    deletePolyline,
  };
}
