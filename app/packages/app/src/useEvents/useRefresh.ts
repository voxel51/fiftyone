import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { default as useRefreshState } from "../useRefresh";
import { EventHandlerHook } from "./registerEvent";
import { processState } from "./utils";

const useRefresh: EventHandlerHook = () => {
  const refresh = useRefreshState();
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      processState(setter, payload.state);
      refresh();
    },
    [refresh, setter]
  );
};

export default useRefresh;
