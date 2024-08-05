import type { EventHandlerHook } from "./registerEvent";

import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { getDatasetName, getParam, resolveURL } from "../utils";
import { AppReadyState } from "./registerEvent";
import { appReadyState, processState } from "./utils";

const useStateUpdate: EventHandlerHook = ({
  router,
  readyStateRef,
  session,
}) => {
  const setReadyState = useSetRecoilState(appReadyState);

  return useCallback(
    (payload: { state: { [key: string]: unknown } }) => {
      const state = processState(session.current, payload.state);
      const stateless = env().VITE_NO_STATE;
      const path = resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: stateless
          ? getDatasetName()
          : (payload.state.dataset as string) ?? null,
        nextView: stateless
          ? getParam("view") || undefined
          : (payload.state.saved_view_slug as string),
        extra: {
          groupId: state.modalSelector?.groupId || null,
          id: state.modalSelector?.id || null,
          slice: stateless ? getParam("slice") : state.groupSlice || null,
          workspace: state.workspace?._name || null,
        },
      });

      console.log(path);

      if (readyStateRef.current !== AppReadyState.OPEN) {
        router.history.replace(path, state);
        router.load().then(() => setReadyState(AppReadyState.OPEN));
      } else {
        router.history.push(path, state);
      }
    },
    [readyStateRef, router, session, setReadyState]
  );
};

export default useStateUpdate;
