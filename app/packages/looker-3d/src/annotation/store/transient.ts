import { useCallback, useEffect, useRef } from "react";
import { atom, useRecoilValue, useSetRecoilState } from "recoil";
import type {
  LabelId,
  TransientCuboidState,
  TransientPolylineState,
  TransientStore,
} from "./types";

/**
 * Fallback delay in milliseconds.
 * After a window pointer-up, if a drag is still active after this delay,
 * we assume something went wrong and force-clear it.
 */
const DRAG_FALLBACK_DELAY_MS = 100;

// =============================================================================
// TRANSIENT STORE ATOM
// =============================================================================

/**
 * Default empty transient store.
 */
const defaultTransientStore: TransientStore = {
  cuboids: {},
  polylines: {},
  activeDragLabel: null,
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
  return useRecoilValue(transientAtom).activeDragLabel !== null;
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
   * Sets the active drag label.
   */
  const setActiveDragLabel = useCallback(
    (labelId: LabelId | null) => {
      setTransient((prev) => ({
        ...prev,
        activeDragLabel: labelId,
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
    setActiveDragLabel,
    clearAll,
    clearLabel,
  };
}

/**
 * Hook that provides a function to start a drag operation.
 */
export function useStartDrag() {
  const { setActiveDragLabel } = useUpdateTransient();

  return useCallback(
    (labelId: LabelId) => {
      setActiveDragLabel(labelId);
    },
    [setActiveDragLabel]
  );
}

/**
 * Hook that provides a function to end a drag operation.
 */
export function useEndDrag() {
  const setTransient = useSetRecoilState(transientAtom);

  return useCallback((labelId: LabelId) => {
    setTransient((prev) => {
      if (prev.activeDragLabel !== labelId) {
        return prev;
      }

      // Clear both the label's transient state and the active drag
      const { [labelId]: _cuboid, ...restCuboids } = prev.cuboids;
      const { [labelId]: _polyline, ...restPolylines } = prev.polylines;

      return {
        cuboids: restCuboids,
        polylines: restPolylines,
        activeDragLabel: null,
      };
    });
  }, []);
}

/**
 * Hook that ensures transient state like drag is properly cleaned up.
 *
 * This handles edge cases like:
 * - Component unmounts mid-drag
 * - Transform events firing out of order
 * - Pointer leaving the window during drag
 */
export function useTransientCleanup() {
  const isDragInProgress = useIsDragInProgress();
  const { clearAll } = useUpdateTransient();
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
      if (!isDragInProgress) return;

      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }

      // Schedule fallback cleanup after a short delay
      // This gives the normal cleanup path time to run first
      fallbackTimeoutRef.current = setTimeout(() => {
        // This is idempotent
        clearAll();
      }, DRAG_FALLBACK_DELAY_MS);
    };

    // Also handle pointer cancel and pointer leave (pointer leaves window)
    const handlePointerCancel = handlePointerUp;
    const handlePointerLeave = (e: PointerEvent) => {
      // Only trigger on leaving the document element (window boundary)
      if (e.target === document.documentElement) {
        handlePointerUp();
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    document.documentElement.addEventListener(
      "pointerleave",
      handlePointerLeave
    );

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      document.documentElement.removeEventListener(
        "pointerleave",
        handlePointerLeave
      );
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [isDragInProgress, clearAll]);
}
