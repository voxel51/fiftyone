import { useSessionSetter } from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { AppReadyState, EventHandlerHook } from "./registerEvent";
import { appReadyState, processState } from "./utils";

const useStateUpdate: EventHandlerHook = ({ router, readyStateRef }) => {
  const setter = useSessionSetter();
  const setReadyState = useSetRecoilState(appReadyState);

  return useCallback(
    (payload: any) => {
      processState(setter, payload.state);
      console.log("useStateUpdate", payload.state);

      const searchParams = new URLSearchParams(router.history.location.search);

      if (payload.state.saved_view_slug) {
        searchParams.set(
          "view",
          encodeURIComponent(payload.state.saved_view_slug)
        );
      } else {
        searchParams.delete("view");
      }

      let search = searchParams.toString();
      if (search.length) {
        search = `?${search}`;
      }

      const path = payload.state.dataset
        ? `/datasets/${encodeURIComponent(payload.state.dataset)}${search}`
        : `/${search}`;

      if (readyStateRef.current !== AppReadyState.OPEN) {
        router.history.replace(path, {
          view: env().VITE_NO_STATE ? [] : payload.state.view || [],
        });
        router.load().then(() => setReadyState(AppReadyState.OPEN));
      } else {
        router.history.push(path, { view: payload.state.view || [] });
      }
    },
    [readyStateRef, router, setter, setReadyState]
  );
};

export default useStateUpdate;
