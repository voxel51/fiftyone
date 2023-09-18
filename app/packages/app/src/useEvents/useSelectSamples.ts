import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSelectSamples: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("selectedSamples", new Set(payload.sample_ids));
    },
    [setter]
  );
};

export default useSelectSamples;
