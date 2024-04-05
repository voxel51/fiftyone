import { useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { resolveURL } from "../utils";
import { EventHandlerHook } from "./registerEvent";

const useSetSpaces: EventHandlerHook = ({ router }) => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      setter("sessionSpaces", payload.spaces);
      router.history.replace(
        resolveURL({
          currentPathname: router.history.location.pathname,
          currentSearch: router.history.location.search,
          extra: {
            workspace: payload.spaces._name ?? null,
          },
        }),
        router.history.location.state
      );
    },
    [router, setter]
  );
};

export default useSetSpaces;
