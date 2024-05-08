import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { resolveURL } from "../utils";
import { EventHandlerHook } from "./registerEvent";
import { processState } from "./utils";

const useRefresh: EventHandlerHook = ({ router, session }) => {
  return useCallback(
    (payload: any) => {
      const stateless = env().VITE_NO_STATE;
      if (stateless) {
        // skip in e2e
        return;
      }

      const state = processState(session.current, payload.state);
      const path = resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: payload.state.dataset ?? null,
        nextView: payload.state.saved_view_slug,
        extra: {
          workspace: state.workspace?._name || null,
        },
      });

      const unsubscribe = subscribe((_, { set }) => {
        set(fos.refresher, (cur) => cur + 1);
        unsubscribe();
      });

      router.history.replace(path, state);
    },
    [router, session]
  );
};

export default useRefresh;
