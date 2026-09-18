/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Session } from "@fiftyone/state";
import { stateSubscription, useClearModal } from "@fiftyone/state";
import { env, getEventSource } from "@fiftyone/utilities";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilState, useRecoilValue } from "recoil";
import type { Queries } from "./makeRoutes";
import type { RoutingContext } from "./routing";
import useEvents from "./useEvents";
import { AppReadyState } from "./useEvents/registerEvent";
import { appReadyState } from "./useEvents/utils";
import { getDatasetName, getParam } from "./utils";

/** How long a disconnected App waits before reaching for the server again. */
const RECONNECT_INTERVAL = 2000;

const useEventSource = (
  router: RoutingContext<Queries>,
  session: MutableRefObject<Session>,
) => {
  const [readyState, setReadyState] = useRecoilState(appReadyState);
  const readyStateRef = useRef<AppReadyState>(readyState);
  readyStateRef.current = readyState;
  const [attempt, setAttempt] = useState(0);
  // Each attempt gets its own controller, so opening a new stream aborts the
  // one that gave up
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt is
  // exactly when a new controller is wanted
  const controller = useMemo(() => new AbortController(), [attempt]);
  const subscription = useRecoilValue(stateSubscription);
  const { subscriptions, handler } = useEvents(
    controller,
    router,
    readyStateRef,
    session,
  );
  const handleError = useErrorHandler();
  const clearModal = useClearModal();

  useEffect(() => {
    getEventSource(
      "/events",
      {
        onmessage: (msg) => {
          if (controller.signal.aborted) {
            return;
          }

          const stateless = env().VITE_NO_STATE;
          if (stateless && readyStateRef.current === AppReadyState.OPEN) {
            return;
          }

          handler(msg.event, msg.data);
        },
        onerror: (e) => handleError(e),
        onclose: () => {
          clearModal();
          setReadyState(AppReadyState.CLOSED);
        },
      },
      controller.signal,
      {
        initializer: {
          dataset: getDatasetName(),
          group_id: getParam("groupId"),
          group_slice: getParam("slice"),
          sample_id: getParam("id"),
          view: getParam("view"),
          workspace: getParam("workspace"),
        },
        subscription,
        events: subscriptions,
      },
    );

    return () => {
      controller.abort();
    };
  }, [
    attempt,
    clearModal,
    controller,
    handleError,
    handler,
    setReadyState,
    subscription,
    subscriptions,
  ]);

  // The stream stops retrying on its own after a few failures, which leaves a
  // session the user can restart showing "not connected" forever. Keep
  // reaching for it while that page is up, and say nothing until it answers.
  useEffect(() => {
    if (readyState !== AppReadyState.CLOSED) return undefined;

    const timeout = setTimeout(
      () => setAttempt((previous) => previous + 1),
      RECONNECT_INTERVAL,
    );
    return () => clearTimeout(timeout);
  }, [attempt, readyState]);

  return readyState;
};

export default useEventSource;
