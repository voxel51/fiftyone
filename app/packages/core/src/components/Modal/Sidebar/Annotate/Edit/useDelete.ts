import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { current, deleteValue } from "./state";
import useExit from "./useExit";

export default function useDelete() {
  const { scene } = useLighter();
  const exit = useExit();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  return useCallback(() => {
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
      detail: { ...label },
    });
    setter();
    exit();
  }, [exit, label, scene]);
}
