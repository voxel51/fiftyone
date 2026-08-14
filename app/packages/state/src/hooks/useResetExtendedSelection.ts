import * as fos from "@fiftyone/state";
import { useRecoilTransaction_UNSTABLE } from "recoil";
import { runExtendedSelectionResetParticipants } from "./extendedSelectionReset";

export default function useResetExtendedSelection() {
  return useRecoilTransaction_UNSTABLE(({ set, reset }) => () => {
    reset(fos.extendedSelectionOverrideStage);
    reset(fos.extendedSelection);
    // Atom effects do not fire in a transaction, so the mirror the atoms
    // restore themselves from is cleared explicitly rather than by their onSet
    fos.clearExtendedSelectionMirror();
    // Extension-owned selection artifacts clear in the SAME transaction
    runExtendedSelectionResetParticipants({ set, reset });
  });
}
