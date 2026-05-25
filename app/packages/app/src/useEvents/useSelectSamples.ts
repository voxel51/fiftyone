import type { SelectionType } from "@fiftyone/state";
import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSelectSamples: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      const samples: Array<{ id: string; type: SelectionType }> =
        payload.samples || [];
      const map = new Map<string, SelectionType>();
      for (const s of samples) {
        map.set(s.id, s.type || "default");
      }
      setter("selectedSamples", map);
    },
    [setter]
  );
};

export default useSelectSamples;
