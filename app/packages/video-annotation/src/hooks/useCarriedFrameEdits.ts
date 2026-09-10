import type { FrameStore } from "@fiftyone/annotation";
import { useMemo, useRef } from "react";

export interface CarriedFrameEdits {
  /** Restore edits stashed by the previous FrameStore of the same sample, then clear the stash. */
  restore: (frames: FrameStore, sampleId: string) => void;
  /** Stash the store's unsaved edits, replacing any prior stash. */
  stash: (frames: FrameStore, sampleId: string) => void;
}

/**
 * Carry unsaved frame edits across a FrameStore rebuild (a frame field
 * activating, or the labels stream re-mounting). The ref dies with the surface,
 * so no edits resurrect across a modal session.
 */
export const useCarriedFrameEdits = (): CarriedFrameEdits => {
  const carry = useRef<{
    sampleId: string;
    snapshot: ReturnType<FrameStore["snapshot"]>;
  } | null>(null);

  return useMemo(
    () => ({
      restore: (frames, sampleId) => {
        // the working overlay is source-independent, so it wins over the seed
        if (carry.current && carry.current.sampleId === sampleId) {
          frames.restore(carry.current.snapshot);
        }
        carry.current = null;
      },
      stash: (frames, sampleId) => {
        carry.current = frames.isDirty()
          ? { sampleId, snapshot: frames.snapshot() }
          : null;
      },
    }),
    [],
  );
};
