import { Session, stateSubscription, useClearModal } from "@fiftyone/state";
import { env, getEventSource } from "@fiftyone/utilities";
import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilState, useRecoilValue } from "recoil";
import { Queries } from "./makeRoutes";
import { RoutingContext, matchPath } from "./routing";
import useEvents from "./useEvents";
import { AppReadyState } from "./useEvents/registerEvent";
import { appReadyState } from "./useEvents/utils";

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
          dataset: getDatasetName(location.pathname),
          view: getSavedViewName(location.search),
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

export const getDatasetName = (pathname: string) => {
  const result = matchPath(
    pathname,
    {
      path: "/datasets/:name",
    },
    "",
    {}
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

const getSavedViewName = (search: string) => {
  const params = new URLSearchParams(search);
  const viewName = params.get("view");
  if (viewName) {
    return decodeURIComponent(viewName);
  }

  return null;
};
