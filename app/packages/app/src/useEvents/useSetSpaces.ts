import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetSpaces: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("sessionSpaces", payload.spaces);
    },
    [setter]
  );
};

export default useSetSpaces;
