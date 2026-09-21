/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { EventHandlerHook } from "./registerEvent";

import { env } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetReverbState, useReverbStore } from "@fiftyone/reverb";
import { getDatasetName, getParam, resolveURL } from "../utils";
import { AppReadyState } from "./registerEvent";
import { syncSessionState } from "@fiftyone/state";
import { appReadyState, processState } from "./utils";

const useStateUpdate: EventHandlerHook = ({
  router,
  readyStateRef,
  session,
}) => {
  const setReadyState = useSetReverbState(appReadyState);
  const store = useReverbStore();

  return useCallback(
    (payload: { state: { [key: string]: unknown } }) => {
      const state = processState(session.current, payload.state);
      const stateless = env().VITE_NO_STATE;
      const path = resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: stateless
          ? getDatasetName()
          : ((payload.state.dataset as string) ?? null),
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

      if (readyStateRef.current !== AppReadyState.OPEN) {
        router.history.replace(path, state);
        router.load().then(() => {
          // The first page is loaded rather than published, so the session
          // atoms have had nothing to sync them.
          syncSessionState(store.set);
          setReadyState(AppReadyState.OPEN);
        });
      } else {
        router.history.push(path, state);
      }
    },
    [readyStateRef, router, session, setReadyState, store],
  );
};

export default useStateUpdate;
