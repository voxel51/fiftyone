import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { getDatasetName, getSavedViewName, resolveURL } from "../utils";
import { AppReadyState, EventHandlerHook } from "./registerEvent";
import { appReadyState, processState } from "./utils";

const useStateUpdate: EventHandlerHook = ({
  router,
  readyStateRef,
  session,
}) => {
  const setReadyState = useSetRecoilState(appReadyState);

  return useCallback(
    (payload: any) => {
      const state = processState(session.current, payload.state);
      const stateless = env().VITE_NO_STATE;
      const path = resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: stateless
          ? getDatasetName()
          : payload.state.dataset ?? null,
        nextView: stateless
          ? getSavedViewName()
          : payload.state.saved_view_slug,
      });
      if (readyStateRef.current !== AppReadyState.OPEN) {
        router.history.replace(path, state);
        router.load().then((e) => setReadyState(AppReadyState.OPEN));
      } else {
        router.history.push(path, state);
      }
    },
    [readyStateRef, router, session, setReadyState]
  );
};

export default useStateUpdate;
