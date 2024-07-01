import type { Session } from "@fiftyone/state";
import { stateSubscription, useClearModal } from "@fiftyone/state";
import { env, getEventSource } from "@fiftyone/utilities";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilState, useRecoilValue } from "recoil";
import type { Queries } from "./makeRoutes";
import type { RoutingContext } from "./routing";
import useEvents from "./useEvents";
import { AppReadyState } from "./useEvents/registerEvent";
import { appReadyState } from "./useEvents/utils";
import { getDatasetName, getParam } from "./utils";

const useEventSource = (
  router: RoutingContext<Queries>,
  session: MutableRefObject<Session>
) => {
  const [readyState, setReadyState] = useRecoilState(appReadyState);
  const readyStateRef = useRef<AppReadyState>(readyState);
  readyStateRef.current = readyState;
  const controller = useMemo(() => new AbortController(), []);
  const subscription = useRecoilValue(stateSubscription);
  const { subscriptions, handler } = useEvents(
    controller,
    router,
    readyStateRef,
    session
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
          sample_id: getParam("sampleId"),
          view: getParam("view"),
          workspace: getParam("workspace"),
        },
        subscription,
        events: subscriptions,
      }
    );

    return () => {
      controller.abort();
    };
  }, [
    clearModal,
    controller,
    handleError,
    handler,
    setReadyState,
    subscription,
    subscriptions,
  ]);

  return readyState;
};

export default useEventSource;
