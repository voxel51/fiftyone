import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import {
  atomFamily,
  DefaultValue,
  selector,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import type { OverlayLabel } from "../../labels/loader";
import {
  isDetection,
  isDetection3dOverlay,
  isPolyline,
  isPolyline3dOverlay,
} from "../../types";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import {
  roundDetection,
  roundPolyline,
  roundTuple,
} from "../utils/rounding-utils";
import type { LabelId, WorkingDoc, WorkingState } from "./types";

// =============================================================================
// WORKING STORE ATOMS
// =============================================================================

/**
 * Default empty working state.
 */
const defaultWorkingState: WorkingState = {
  doc: {
    labelsById: {},
    deletedIds: new Set(),
  },
  initialized: false,
};

/**
 * Atom family for working state, keyed by sampleId.
 * Each sample has its own independent working state.
 */
export const workingAtomFamily = atomFamily<WorkingState, string>({
  key: "fo3d-workingStore",
  default: defaultWorkingState,
});

/**
 * Public facade selector for accessing the working state of the current sample.
 * Automatically keys by the current sample ID.
 */
export const workingAtom = selector<WorkingState>({
  key: "fo3d-workingStoreFacade",
  get: ({ get }) => {
    const sampleId = get(fos.currentSampleId);
    if (!sampleId) {
      return defaultWorkingState;
    }
    return get(workingAtomFamily(sampleId));
  },
  set: ({ get, set }, newValue) => {
    const sampleId = get(fos.currentSampleId);
    if (!sampleId || newValue instanceof DefaultValue) {
      return;
    }
    set(workingAtomFamily(sampleId), newValue);
  },
});

/**
 * Selector that returns just the working document for the current sample.
 */
export const workingDocSelector = selector<WorkingDoc>({
  key: "fo3d-workingDocSelector",
  get: ({ get }) => {
    return get(workingAtom).doc;
  },
});

// =============================================================================
// INITIALIZATION HOOKS
// =============================================================================

/**
 * Converts raw overlays to a labelsById map for the working store.
 */
function mapOverlaysToLabelId(
  overlays: OverlayLabel[]
): Record<LabelId, ReconciledDetection3D | ReconciledPolyline3D> {
  const labelsById: Record<
    LabelId,
    ReconciledDetection3D | ReconciledPolyline3D
  > = {};

  for (const overlay of overlays) {
    if (isDetection3dOverlay(overlay)) {
      const detection: ReconciledDetection3D = {
        ...overlay,
        _cls: "Detection",
        location: overlay.location as [number, number, number],
        dimensions: overlay.dimensions as [number, number, number],
        rotation: overlay.rotation,
        quaternion: overlay.quaternion,
      };
      labelsById[overlay._id] = roundDetection(detection);
    } else if (isPolyline3dOverlay(overlay)) {
      const polyline: ReconciledPolyline3D = {
        ...overlay,
        _cls: "Polyline",
        points3d: overlay.points3d,
        filled: !!overlay.filled,
        closed: !!overlay.closed,
      };
      labelsById[overlay._id] = roundPolyline(polyline);
    }
  }

  return labelsById;
}

/**
 * Hook that initializes the working store from baseline raw overlays.
 * Should be called when entering annotate mode.
 *
 * @param rawOverlays - The baseline raw overlays from server loaded from modalSample
 * @returns Function to force re-initialization
 */
export function useInitializeWorking(rawOverlays: OverlayLabel[]) {
  const setWorking = useSetRecoilState(workingAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const workingState = useRecoilValue(workingAtom);
  const mode = fos.useModalMode();

  // Initialize working store from overlays when entering annotate mode
  useEffect(() => {
    if (
      mode !== fos.ModalMode.ANNOTATE ||
      !currentSampleId ||
      workingState.initialized
    ) {
      return;
    }

    const labelsById = mapOverlaysToLabelId(rawOverlays);

    setWorking({
      doc: {
        labelsById,
        deletedIds: new Set(),
      },
      initialized: true,
    });
  }, [mode, currentSampleId, rawOverlays, workingState.initialized]);

  // Return a function to force re-initialization (eg., after save)
  const reinitialize = useCallback(() => {
    if (!currentSampleId) return;

    const labelsById = mapOverlaysToLabelId(rawOverlays);

    setWorking({
      doc: {
        labelsById,
        deletedIds: new Set(),
      },
      initialized: true,
    });
  }, [currentSampleId, rawOverlays, setWorking]);

  return { reinitialize };
}

/**
 * Hook that resets the working store when leaving annotate mode.
 */
export function useResetWorkingOnModeChange() {
  const mode = fos.useModalMode();
  const setWorking = useSetRecoilState(workingAtom);

  useEffect(() => {
    if (mode !== fos.ModalMode.ANNOTATE) {
      setWorking(defaultWorkingState);
    }
  }, [mode, setWorking]);
}

// =============================================================================
// ACCESSOR HOOKS
// =============================================================================

/**
 * Hook that returns the working document.
 */
export function useWorkingDoc(): WorkingDoc {
  return useRecoilValue(workingDocSelector);
}

/**
 * Hook that returns a specific label from the working store.
 */
export function useWorkingLabel(
  labelId: LabelId
): ReconciledDetection3D | ReconciledPolyline3D | undefined {
  const doc = useWorkingDoc();
  return doc.labelsById[labelId];
}

/**
 * Hook that returns whether a label has been deleted.
 */
export function useIsLabelDeleted(labelId: LabelId): boolean {
  const doc = useWorkingDoc();
  return doc.deletedIds.has(labelId);
}

/**
 * Hook that returns all detections from the working store.
 */
export function useWorkingDetections(): ReconciledDetection3D[] {
  const doc = useWorkingDoc();
  return Object.values(doc.labelsById).filter(
    (label): label is ReconciledDetection3D =>
      isDetection(label) && !doc.deletedIds.has(label._id)
  );
}

/**
 * Hook that returns all polylines from the working store.
 */
export function useWorkingPolylines(): ReconciledPolyline3D[] {
  const doc = useWorkingDoc();
  return Object.values(doc.labelsById).filter(
    (label): label is ReconciledPolyline3D =>
      isPolyline(label) && !doc.deletedIds.has(label._id)
  );
}

/**
 * Hook that returns all deleted labels from the working store.
 */
export function useDeletedWorkingLabels(): (
  | ReconciledDetection3D
  | ReconciledPolyline3D
)[] {
  const doc = useWorkingDoc();
  const deletedLabels: (ReconciledDetection3D | ReconciledPolyline3D)[] = [];

  doc.deletedIds.forEach((deletedId) => {
    const label = doc.labelsById[deletedId];
    if (label) {
      deletedLabels.push(label);
    }
  });

  return deletedLabels;
}

// =============================================================================
// CALLBACK HOOKS FOR OPERATIONS
// =============================================================================

/**
 * Hook that returns a callback to update a label in the working store.
 */
export function useUpdateWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (
        labelId: LabelId,
        updates: Partial<ReconciledDetection3D> | Partial<ReconciledPolyline3D>
      ) => {
        set(workingAtom, (prev): WorkingState => {
          const existingLabel = prev.doc.labelsById[labelId];

          if (!existingLabel) {
            return prev;
          }

          // Round numeric values for consistency
          const roundedUpdates: Record<string, unknown> = { ...updates };

          if (isDetection(existingLabel)) {
            const detectionUpdates = updates as Partial<ReconciledDetection3D>;
            if (detectionUpdates.location) {
              roundedUpdates.location = roundTuple(detectionUpdates.location);
            }
            if (detectionUpdates.dimensions) {
              roundedUpdates.dimensions = roundTuple(
                detectionUpdates.dimensions
              );
            }
            if (detectionUpdates.rotation) {
              roundedUpdates.rotation = roundTuple(detectionUpdates.rotation);
            }
            if (detectionUpdates.quaternion) {
              roundedUpdates.quaternion = roundTuple(
                detectionUpdates.quaternion
              );
            }
          } else if (isPolyline(existingLabel)) {
            const polylineUpdates = updates as Partial<ReconciledPolyline3D>;
            if (polylineUpdates.points3d) {
              roundedUpdates.points3d = polylineUpdates.points3d.map(
                (segment) =>
                  segment.map(
                    (point) => roundTuple(point) as [number, number, number]
                  )
              );
            }
          }

          const updatedLabel = {
            ...existingLabel,
            ...roundedUpdates,
          } as ReconciledDetection3D | ReconciledPolyline3D;

          return {
            ...prev,
            doc: {
              ...prev.doc,
              labelsById: {
                ...prev.doc.labelsById,
                [labelId]: updatedLabel,
              },
            },
          };
        });
      },
    []
  );
}

/**
 * Hook that returns a callback to add a new label to the working store.
 */
export function useAddWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (label: ReconciledDetection3D | ReconciledPolyline3D) => {
        const roundedLabel = isDetection(label)
          ? roundDetection(label)
          : roundPolyline(label);

        set(workingAtom, (prev) => {
          // Remove from deletedIds if present
          const newDeletedIds = new Set(prev.doc.deletedIds);
          newDeletedIds.delete(roundedLabel._id);

          return {
            ...prev,
            doc: {
              ...prev.doc,
              labelsById: {
                ...prev.doc.labelsById,
                [roundedLabel._id]: roundedLabel,
              },
              deletedIds: newDeletedIds,
            },
          };
        });
      },
    []
  );
}

/**
 * Hook that returns a callback to delete a label from the working store.
 */
export function useDeleteWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (labelId: LabelId) => {
        set(workingAtom, (prev) => {
          const newDeletedIds = new Set(prev.doc.deletedIds);
          newDeletedIds.add(labelId);

          return {
            ...prev,
            doc: {
              ...prev.doc,
              deletedIds: newDeletedIds,
            },
          };
        });
      },
    []
  );
}

/**
 * Hook that returns a callback to restore a deleted label.
 */
export function useRestoreWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (labelId: LabelId) => {
        set(workingAtom, (prev) => {
          const newDeletedIds = new Set(prev.doc.deletedIds);
          newDeletedIds.delete(labelId);

          return {
            ...prev,
            doc: {
              ...prev.doc,
              deletedIds: newDeletedIds,
            },
          };
        });
      },
    []
  );
}
