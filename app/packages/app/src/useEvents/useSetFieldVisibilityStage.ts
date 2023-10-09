import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";

const useSetFieldVisibilityStage: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      console.log("useSetFieldVisibilityStage", payload);
      setter("fieldVisibilityStage", payload.fieldVisibilityStage);
    },
    [setter]
  );
};
export default useSetFieldVisibilityStage;
