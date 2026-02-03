import { useCallback } from "react";
import { atom, useRecoilValue, useSetRecoilState } from "recoil";
import type {
  LabelId,
  TransientCuboidState,
  TransientPolylineState,
  TransientStore,
} from "./types";

// =============================================================================
// TRANSIENT STORE ATOM
// =============================================================================

/**
 * Default empty transient store.
 */
const defaultTransientStore: TransientStore = {
  cuboids: {},
  polylines: {},
  dragInProgress: false,
};

/**
 * Transient store atom for ephemeral interaction state.
 *
 * - Stores drag deltas, hover states, snapping previews etc
 * - NOT persisted
 * - Meant to be cleared on pointer-up (or "transform end") after committing to working store
 */
export const transientAtom = atom<TransientStore>({
  key: "fo3d-transientStore",
  default: defaultTransientStore,
});

// =============================================================================
// ACCESSOR HOOKS
// =============================================================================

/**
 * Hook that returns the entire transient store.
 */
export function useTransientStore(): TransientStore {
  return useRecoilValue(transientAtom);
}

/**
 * Hook that returns the transient state for a specific cuboid.
 */
export function useTransientCuboid(
  labelId: LabelId
): TransientCuboidState | undefined {
  const store = useRecoilValue(transientAtom);
  return store.cuboids[labelId];
}

/**
 * Hook that returns the transient state for a specific polyline.
 */
export function useTransientPolyline(
  labelId: LabelId
): TransientPolylineState | undefined {
  const store = useRecoilValue(transientAtom);
  return store.polylines[labelId];
}

/**
 * Hook that returns whether a drag is in progress.
 */
export function useIsDragInProgress(): boolean {
  return useRecoilValue(transientAtom).dragInProgress;
}

// =============================================================================
// UPDATE HOOKS
// =============================================================================

/**
 * Hook that provides functions to update the transient store.
 */
export function useUpdateTransient() {
  const setTransient = useSetRecoilState(transientAtom);

  /**
   * Updates the transient state for a cuboid.
   */
  const updateCuboid = useCallback(
    (labelId: LabelId, state: TransientCuboidState | null) => {
      setTransient((prev) => {
        if (state === null) {
          const { [labelId]: _, ...rest } = prev.cuboids;
          return {
            ...prev,
            cuboids: rest,
          };
        }

        const newState = {
          ...prev,
          cuboids: {
            ...prev.cuboids,
            [labelId]: state,
          },
        };
        return newState;
      });
    },
    []
  );

  /**
   * Updates the transient state for a polyline.
   */
  const updatePolyline = useCallback(
    (labelId: LabelId, state: TransientPolylineState | null) => {
      setTransient((prev) => {
        if (state === null) {
          const { [labelId]: _, ...rest } = prev.polylines;
          return {
            ...prev,
            polylines: rest,
          };
        }

        return {
          ...prev,
          polylines: {
            ...prev.polylines,
            [labelId]: state,
          },
        };
      });
    },
    []
  );

  /**
   * Sets whether a drag is in progress.
   */
  const setDragInProgress = useCallback(
    (inProgress: boolean) => {
      setTransient((prev) => ({
        ...prev,
        dragInProgress: inProgress,
      }));
    },
    [setTransient]
  );

  /**
   * Clears all transient state.
   */
  const clearAll = useCallback(() => {
    setTransient(defaultTransientStore);
  }, [setTransient]);

  /**
   * Clears transient state for a specific label.
   */
  const clearLabel = useCallback(
    (labelId: LabelId) => {
      setTransient((prev) => {
        const { [labelId]: _cuboid, ...restCuboids } = prev.cuboids;
        const { [labelId]: _polyline, ...restPolylines } = prev.polylines;
        return {
          ...prev,
          cuboids: restCuboids,
          polylines: restPolylines,
        };
      });
    },
    [setTransient]
  );

  return {
    updateCuboid,
    updatePolyline,
    setDragInProgress,
    clearAll,
    clearLabel,
  };
}

/**
 * Hook that provides a function to start a drag operation.
 */
export function useStartDrag() {
  const { setDragInProgress } = useUpdateTransient();

  return useCallback(() => {
    setDragInProgress(true);
  }, [setDragInProgress]);
}

/**
 * Hook that provides a function to end a drag operation.
 */
export function useEndDrag() {
  const { setDragInProgress, clearLabel } = useUpdateTransient();

  return useCallback(
    (labelId: LabelId) => {
      clearLabel(labelId);
      setDragInProgress(false);
    },
    [setDragInProgress, clearLabel]
  );
}
