import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSelectLabels: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      setter("sessionGroupSlice", payload.slice);
    },
    [setter]
  );
};

export default useSelectLabels;
