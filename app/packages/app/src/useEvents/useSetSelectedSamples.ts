import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetSelectedSamples: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("selectedSamples", payload.sample_ids);
    },
    [setter]
  );
};

export default useSetSelectedSamples;
