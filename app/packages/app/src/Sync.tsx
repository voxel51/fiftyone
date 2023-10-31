import { Loading } from "@fiftyone/components";
import { usePlugins } from "@fiftyone/plugins";
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
import { commitMutation, Environment, OperationType } from "relay-runtime";
import Setup from "./components/Setup";
import { IndexPageQuery } from "./pages/__generated__/IndexPageQuery.graphql";
import {
  DatasetPageQuery,
  DatasetPageQuery$data,
} from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import { Entry, useRouterContext } from "./routing";
import { AppReadyState } from "./useEvents/registerEvent";
import useEventSource from "./useEventSource";
import useSetters from "./useSetters";
import useWriters from "./useWriters";

export const SessionContext = React.createContext<Session>(SESSION_DEFAULT);

const Plugins = ({ children }: { children: React.ReactNode }) => {
  const plugins = usePlugins();
  if (plugins.isLoading) return <Loading>Pixelating...</Loading>;
  if (plugins.hasError) return <Loading>Plugin error...</Loading>;

  return <>{children}</>;
};

const Sync = ({ children }: { children?: React.ReactNode }) => {
  const environment = useRelayEnvironment();
  const subscription = useRecoilValue(stateSubscription);

  const router = useRouterContext();
  const readyState = useEventSource(router);

  const sessionRef = useRef<Session>(SESSION_DEFAULT);
  const setters = useSetters(environment, router, sessionRef);
  useWriters(subscription, environment, router, sessionRef);

  useEffect(
    () =>
      subscribe((_, { reset }) => {
        reset(fos.currentModalSample);
      }),
    []
  );

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
              dispatchSideEffect({
                action,
                currentEntry: router.get(),
                environment,
                nextEntry: entry,
                subscription,
                session: sessionRef.current,
              });
              fn(entry);
            });
          }}
        >
          <Plugins>{children}</Plugins>
        </Writer>
      )}
    </SessionContext.Provider>
  );
};

const dispatchSideEffect = ({
  action,
  currentEntry,
  environment,
  nextEntry,
  subscription,
  session,
}: {
  currentEntry: Entry<IndexPageQuery | DatasetPageQuery>;
  environment: Environment;
  nextEntry: Entry<IndexPageQuery | DatasetPageQuery>;
  action: Action | undefined;
  session: Session;
  subscription: string;
}) => {
  if (action !== "POP") {
    return;
  }

  session.selectedLabels = [];
  session.selectedSamples = new Set();

  const currentDataset: string | undefined =
    // @ts-ignore
    currentEntry.preloadedQuery.variables.name;
  const nextDataset: string | undefined =
    // @ts-ignore
    nextEntry.preloadedQuery.variables.name;

  if (!nextDataset) {
    session.sessionSpaces = fos.SPACES_DEFAULT;
    commitMutation<setDatasetMutation>(nextEntry.preloadedQuery.environment, {
      mutation: setDataset,
      variables: {
        subscription,
      },
    });
    return;
  }

  // @ts-ignore
  const data: DatasetPageQuery$data = nextEntry.data;
  if (currentDataset !== nextDataset) {
    session.fieldVisibilityStage = nextEntry.state.fieldVisibility;
    session.sessionSpaces = fos.SPACES_DEFAULT;
    session.colorScheme = fos.ensureColorScheme(
      data.dataset?.appConfig?.colorScheme,
      data.config
    );
    session.sessionGroupSlice = data.dataset?.defaultGroupSlice || undefined;
  }

  commitMutation<setViewMutation>(environment, {
    mutation: setView,
    variables: {
      view: nextEntry.state.view,
      savedViewSlug: nextEntry.state.savedViewSlug,
      form: {},
      datasetName: nextDataset as string,
      subscription,
    },
  });
};

export default Sync;
