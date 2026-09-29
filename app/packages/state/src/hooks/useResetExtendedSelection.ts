import { useReverbCallback, useReverbTransaction } from "@fiftyone/reverb";
import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
  writeExtendedSelectionMirror,
} from "../atoms/atoms";
import {
  runExtendedSelectionResetParticipants,
  type ExtendedSelectionResetInterface,
} from "./extendedSelectionReset";

/**
 * Clears every extended-selection layer inside the caller's Reverb
 * transaction. The atoms' effects update the mirror they restore themselves
 * from on fragment refetches only once the transaction commits, so the
 * mirror is cleared here as well, in step with the reset.
 */
export function resetExtendedSelectionTransaction(
  cb: ExtendedSelectionResetInterface,
): void {
  cb.reset(extendedSelectionOverrideStage);
  cb.reset(extendedSelection);
  clearExtendedSelectionMirror();
  // Extension-owned selection artifacts clear in the SAME transaction
  runExtendedSelectionResetParticipants(cb);
}

export default function useResetExtendedSelection() {
  return useReverbTransaction(
    ({ set, reset }) =>
      () =>
        resetExtendedSelectionTransaction({ set, reset }),
  );
}

/**
 * Publishes a result to the extended selection through the caller's `cb`,
 * replacing whatever selection was there: its stage narrows the grid without
 * changing the view, and `decorate` writes the publisher's own selection
 * artifacts in the same commit.
 */
export function publishExtendedSelection(
  cb: ExtendedSelectionResetInterface,
  stage: Record<string, Record<string, unknown>>,
  decorate?: (cb: ExtendedSelectionResetInterface) => void,
): void {
  // The previous selection's sample ids still scope the sidebar's counts and
  // reach operators, and its artifacts stay drawn, unless they clear before
  // the new stage is written
  cb.reset(extendedSelection);
  runExtendedSelectionResetParticipants(cb);
  cb.set(extendedSelectionOverrideStage, stage);
  // A write to the stage before anything has read it never reaches the
  // effect that keeps the mirror, and the atom's first read then restores
  // the mirror's empty stage over it, so the mirror is written in step
  writeExtendedSelectionMirror(stage);
  decorate?.(cb);
}

/** {@link publishExtendedSelection}, committed as one Reverb batch. */
export function usePublishExtendedSelection() {
  return useReverbCallback(
    ({ set, reset }) =>
      (
        stage: Record<string, Record<string, unknown>>,
        decorate?: (cb: ExtendedSelectionResetInterface) => void,
      ) =>
        publishExtendedSelection({ set, reset }, stage, decorate),
    [],
  );
}
