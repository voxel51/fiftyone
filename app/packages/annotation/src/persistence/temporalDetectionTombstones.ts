import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * A TemporalDetection that the user explicitly deleted, keyed by its
 * field path and detection `_id`.
 */
export interface TemporalDetectionTombstone {
  field: string;
  id: string;
}

// Module-private; consumed only through the hooks below. Lives on jotai's
// default store, matching the rest of the Annotate surface.
const temporalDetectionTombstonesState = atom<
  readonly TemporalDetectionTombstone[]
>([]);

/** Current TemporalDetection tombstones for the active sample. */
export const useTemporalDetectionTombstones =
  (): readonly TemporalDetectionTombstone[] =>
    useAtomValue(temporalDetectionTombstonesState);

/**
 * Returns a callback that records a TemporalDetection deletion so the
 * delta supplier persists it on the next autosave tick. Idempotent —
 * re-tombstoning the same `field`/`id` is a no-op.
 */
export const useTombstoneTemporalDetection = (): ((
  field: string,
  id: string
) => void) => {
  const setTombstones = useSetAtom(temporalDetectionTombstonesState);

  return useCallback(
    (field, id) => {
      setTombstones((prev) =>
        prev.some((t) => t.field === field && t.id === id)
          ? prev
          : [...prev, { field, id }]
      );
    },
    [setTombstones]
  );
};

/** Clears all tombstones — used when the modal sample changes. */
export const useResetTemporalDetectionTombstones = (): (() => void) => {
  const setTombstones = useSetAtom(temporalDetectionTombstonesState);
  return useCallback(() => setTombstones([]), [setTombstones]);
};
