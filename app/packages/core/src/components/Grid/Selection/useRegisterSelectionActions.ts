import { registerGridSelectionAction } from "@fiftyone/multimodal/extensions/grid-selection";
import { useEffect } from "react";
import { addToSubsetAction } from "./SubsetAction";
import { tagSelectionAction } from "./TagAction";
import { hideSelectedAction, showOnlySelectedAction } from "./ViewActions";

let consumers = 0;
let dispose: (() => void) | undefined;

/** Shared grids own built-in actions; multiple panels share one registration. */
export function useRegisterSelectionActions() {
  // This effect keeps actions registered until the last grid or empty view unmounts.
  useEffect(() => {
    if (consumers++ === 0) {
      const disposers = [
        addToSubsetAction,
        tagSelectionAction,
        showOnlySelectedAction,
        hideSelectedAction,
      ].map(registerGridSelectionAction);
      dispose = () => disposers.forEach((unregister) => unregister());
    }
    return () => {
      if (--consumers === 0) {
        dispose?.();
        dispose = undefined;
      }
    };
  }, []);
}
