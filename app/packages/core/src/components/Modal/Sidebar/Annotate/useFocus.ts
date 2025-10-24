import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useEffect } from "react";
import { editing } from "./Edit";
import { labelMap } from "./useLabels";

export default function useFocus() {
  const { scene } = useLighter();

  useEffect(() => {
    const store = getDefaultStore();

    scene?.on(LIGHTER_EVENTS.OVERLAY_SELECT, (event) => {
      const label = store.get(labelMap)[event.detail.id];
      if (label) {
        store.set(editing, label);
      }
    });
  }, [scene]);
}
