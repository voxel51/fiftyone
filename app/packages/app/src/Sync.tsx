import { Loading } from "@fiftyone/components";
import {
  setDataset,
  setDatasetMutation,
  setView,
  setViewMutation,
  subscribe,
  Writer,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Session, SESSION_DEFAULT, stateSubscription } from "@fiftyone/state";
import { Action } from "history";
import React, { useEffect, useRef } from "react";
import { useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";
import { commitMutation, OperationType } from "relay-runtime";
import Setup from "./components/Setup";
import { IndexPageQuery } from "./pages/__generated__/IndexPageQuery.graphql";
import { DatasetPageQuery } from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import { Entry, useRouterContext } from "./routing";
import { AppReadyState } from "./useEvents/registerEvent";
import useEventSource, { getDatasetName } from "./useEventSource";
import useSetters from "./useSetters";
import useWriters from "./useWriters";

export const SessionContext = React.createContext<Session>(SESSION_DEFAULT);

const Sync = ({ children }: { children?: React.ReactNode }) => {
  const environment = useRelayEnvironment();
  const subscription = useRecoilValue(stateSubscription);

  const router = useRouterContext();
  const readyState = useEventSource(router);

  const sessionRef = useRef<Session>(SESSION_DEFAULT);
  const setters = useSetters(environment, router, sessionRef);
  useWriters(subscription, environment, router, sessionRef);

  useEffect(() => {
    subscribe((_, { reset }) => {
      reset(fos.currentModalSample);
    });
  }, []);

  return (
    <SessionContext.Provider value={sessionRef.current}>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <Loading>Pixelating...</Loading>
      )}
      {readyState === AppReadyState.OPEN && (
        <Writer<OperationType>
          read={() => {
            const { concreteRequest, data, preloadedQuery } = router.get();
            return {
              concreteRequest,
              data,
              preloadedQuery,
            };
          }}
          setters={setters}
          subscribe={(fn) => {
            return router.subscribe((entry, action) => {
              dispatchSideEffect(entry, action, subscription);
              fn(entry);
            });
          }}
        >
          {children}
        </Writer>
      )}
    </SessionContext.Provider>
  );
};

const dispatchSideEffect = (
  entry: Entry<IndexPageQuery | DatasetPageQuery>,
  action: Action | undefined,
  subscription: string
) => {
  if (action !== "POP") {
    return;
  }

  if (entry.pathname === "/") {
    commitMutation<setDatasetMutation>(entry.preloadedQuery.environment, {
      mutation: setDataset,
      variables: {
        subscription,
      },
    });
    return;
  }

  commitMutation<setViewMutation>(entry.preloadedQuery.environment, {
    mutation: setView,
    variables: {
      view: entry.state.view,
      savedViewSlug: entry.state.savedViewSlug,
      form: {},
      datasetName: getDatasetName(entry.pathname) as string,
      subscription,
    },
  });
};

export default Sync;
