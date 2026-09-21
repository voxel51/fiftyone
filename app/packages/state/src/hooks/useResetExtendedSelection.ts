import { useReverbTransaction } from "@fiftyone/reverb";
import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
} from "../atoms/atoms";
import {
  runExtendedSelectionResetParticipants,
  type ExtendedSelectionResetInterface,
} from "./extendedSelectionReset";

/**
 * Clears every extended-selection layer inside the caller's
 * transaction. Atom effects do not fire in a transaction, so the mirror the
 * atoms restore themselves from on fragment refetches is cleared explicitly
 * alongside them — any transaction that resets the atoms without this
 * resurrects the selection on the next dataset fragment update.
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
