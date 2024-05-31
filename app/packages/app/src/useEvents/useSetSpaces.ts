import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { LocationState } from "../routing";
import { resolveURL } from "../utils";
import { EventHandlerHook } from "./registerEvent";

const useSetSpaces: EventHandlerHook = ({ router }) => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("sessionSpaces", payload.spaces);
      const state = router.history.location.state as LocationState;
      router.history.replace(
        resolveURL({
          currentPathname: router.history.location.pathname,
          currentSearch: router.history.location.search,
          extra: {
            workspace: payload.spaces._name ?? null,
          },
        }),
        { ...state, workspace: payload.spaces }
      );
    },
    [router, setter]
  );
};

export default useSetSpaces;
