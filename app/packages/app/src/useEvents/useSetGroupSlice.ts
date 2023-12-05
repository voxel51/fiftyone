import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetGroupSlice: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      setter("sessionGroupSlice", payload.slice);
    },
    [setter]
  );
};

export default useSetGroupSlice;
