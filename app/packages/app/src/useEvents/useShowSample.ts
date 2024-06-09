import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { LocationState } from "../routing";
import { resolveURL } from "../utils";
import { EventHandlerHook } from "./registerEvent";

const useSetSample: EventHandlerHook = ({ router }) => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("sessionSampleId", { id: payload.sample_id });
      const state = router.history.location.state as LocationState;
      router.history.push(
        resolveURL({
          currentPathname: router.history.location.pathname,
          currentSearch: router.history.location.search,
          extra: {
            sampleId: payload.sample_id,
          },
        }),
        { ...state, workspace: payload.spaces }
      );
    },
    [router, setter]
  );
};

export default useSetSample;
