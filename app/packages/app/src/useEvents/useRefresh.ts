import { useRefresh as useRefreshState } from "@fiftyone/state";
import { EventHandlerHook } from "./registerEvent";

const useRefresh: EventHandlerHook = () => {
  return useRefreshState();
};

export default useRefresh;
