import { useSessionSetter } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { getDatasetName, getSavedViewName, resolveURL } from "../utils";
import { AppReadyState, EventHandlerHook } from "./registerEvent";
import { appReadyState, processState } from "./utils";

const useStateUpdate: EventHandlerHook = ({ router, readyStateRef }) => {
  const setter = useSessionSetter();
  const setReadyState = useSetRecoilState(appReadyState);

  return useCallback(
    (payload: any) => {
      processState(setter, payload.state);
      const stateless = env().VITE_NO_STATE;
      const path = resolveURL(
        router,
        stateless ? getDatasetName() : payload.state.dataset,
        stateless ? getSavedViewName() : payload.state.saved_view_slug
      );
      if (readyStateRef.current !== AppReadyState.OPEN) {
        router.history.replace(path, {
          view: stateless ? [] : payload.state.view || [],
        });
        router.load().then(() => setReadyState(AppReadyState.OPEN));
      } else if (!stateless) {
        router.history.push(path, { view: payload.state.view || [] });
      }
    },
    [readyStateRef, router, setter, setReadyState]
  );
};

export default useStateUpdate;
