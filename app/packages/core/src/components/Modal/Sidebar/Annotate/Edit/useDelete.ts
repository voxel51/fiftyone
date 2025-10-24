import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { current, deleteValue } from "./state";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  return useCallback(() => {
    setter();

    scene?.exitInteractiveMode();
    !label?.isNew &&
      scene?.dispatchSafely({
        type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
        detail: {
          label,
        },
      });
    removeOverlay(label?.data._id);
  }, [label, scene, setter, removeOverlay]);
}
