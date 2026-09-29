/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LoadingScreen } from "@voxel51/voodo";
import { usePlugins } from "@fiftyone/plugins";
import {
  Writer,
  setDataset,
  type setDatasetMutation,
  setSpaces,
  type setSpacesMutation,
  setView,
  type setViewMutation,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  SESSION_DEFAULT,
  type Session,
  stateSubscription,
} from "@fiftyone/state";
import type { Action } from "history";
import React, { useRef } from "react";
import { useRelayEnvironment } from "react-relay";
import { useReverbValue } from "@fiftyone/reverb";
import {
  type Environment,
  type OperationType,
  commitMutation,
} from "relay-runtime";
import Setup from "./components/Setup";
import SharedSessionBanner from "./components/SharedSessionBanner";
import type { IndexPageQuery } from "./pages/__generated__/IndexPageQuery.graphql";
import type {
  DatasetPageQuery,
  DatasetPageQuery$data,
  DatasetPageQuery$variables,
} from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import { type Entry, useRouterContext } from "./routing";
import useEventSource from "./useEventSource";
import { AppReadyState } from "./useEvents/registerEvent";
import useSetters from "./useSetters";
import useSliceFromLocation from "./location/useSliceFromLocation";
import SamplePageProvider from "./samplePage/SamplePageProvider";
import useWriters from "./useWriters";

export const SessionContext = React.createContext<Session>(SESSION_DEFAULT);

const Plugins = ({ children }: { children: React.ReactNode }) => {
  const plugins = usePlugins();
  if (plugins.isLoadingPlugins) return <LoadingScreen text="Pixelating" />;
  return <>{children}</>;
};

const Sync = ({ children }: { children?: React.ReactNode }) => {
  const environment = useRelayEnvironment();
  const subscription = useReverbValue(stateSubscription);
  const router = useRouterContext();
  const sessionRef = useRef<Session>(SESSION_DEFAULT);
  const setters = useSetters(environment, router, sessionRef);
  useWriters(subscription, environment, router, sessionRef);
  useSliceFromLocation();

  const readyState = useEventSource(router, sessionRef);

  return (
    <SessionContext.Provider value={sessionRef.current}>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <LoadingScreen text="Pixelating" />
      )}
      {readyState === AppReadyState.OPEN && <SharedSessionBanner />}
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
            return router.subscribe(({ state, ...entry }, action) => {
              dispatchSideEffect({
                action,
                currentEntry: router.get(),
                environment,
                nextEntry: { state, ...entry },
                subscription,
                session: sessionRef.current,
              });
              fn({ ...entry, event: state.event });
            });
          }}
        >
          <Plugins>
            <SamplePageProvider>{children}</SamplePageProvider>
          </Plugins>
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
  session.selectedSamples = new Map();
  session.sampleSelectionStyle = fos.DEFAULT_SELECTION_STYLE;

  const currentDataset = (
    currentEntry.preloadedQuery.variables as Partial<DatasetPageQuery$variables>
  ).name;
  const nextDataset = (
    nextEntry.preloadedQuery.variables as Partial<DatasetPageQuery$variables>
  ).name;

  if (!nextDataset) {
    session.sessionSpaces = fos.GRID_SPACES_DEFAULT;
    commitMutation<setDatasetMutation>(nextEntry.preloadedQuery.environment, {
      mutation: setDataset,
      variables: {
        subscription,
      },
    });
    return;
  }

  const data = nextEntry.data as DatasetPageQuery$data;

  let update = !fos.viewsAreEqual(
    currentEntry.state.view,
    nextEntry.state.view,
  );
  if (currentDataset !== nextDataset) {
    update = true;
    session.colorScheme = fos.ensureColorScheme(
      data.dataset?.appConfig?.colorScheme,
      data.config,
    );
    session.fieldVisibilityStage = nextEntry.state.fieldVisibility;
    session.sessionSpaces =
      nextEntry.state?.workspace ?? fos.GRID_SPACES_DEFAULT;
  }

  update &&
    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        view: nextEntry.state.view,
        savedViewSlug: nextEntry.state.savedViewSlug,
        form: {},
        datasetName: nextDataset,
        subscription,
      },
      onCompleted: () => {
        nextEntry.state?.workspace &&
          commitMutation<setSpacesMutation>(environment, {
            mutation: setSpaces,
            variables: {
              spaces: nextEntry.state?.workspace,
              subscription,
            },
          });
      },
    });
};

export default Sync;
