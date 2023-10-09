import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetFieldVisibility: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      console.log("useSetFieldVisibility", payload);
      setter("colorScheme", payload.fieldVisibility);
    },
    [setter]
  );
};
export default useSetFieldVisibility;
