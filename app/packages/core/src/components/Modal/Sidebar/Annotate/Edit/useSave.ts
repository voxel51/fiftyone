import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { addValue, current, savedLabel } from "./state";

export default function useSave() {
  const { scene } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);

  return useCallback(() => {
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
      detail: { label },
    });
    setter();
    label?.data && saved(label?.data);
  }, [label, saved, scene, setter]);
}
