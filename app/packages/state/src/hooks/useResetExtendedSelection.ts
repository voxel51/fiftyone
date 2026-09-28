import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
} from "../recoil/atoms";
import {
  runExtendedSelectionResetParticipants,
  type ExtendedSelectionResetInterface,
} from "./extendedSelectionReset";

/**
 * Clears every extended-selection layer inside the caller's Recoil
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
  return useRecoilTransaction_UNSTABLE(
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
  decorate?.(cb);
}

/** {@link publishExtendedSelection}, committed as one Recoil batch. */
export function usePublishExtendedSelection() {
  return useRecoilCallback(
    ({ set, reset }) =>
      (
        stage: Record<string, Record<string, unknown>>,
        decorate?: (cb: ExtendedSelectionResetInterface) => void,
      ) =>
        publishExtendedSelection({ set, reset }, stage, decorate),
    [],
  );
}
