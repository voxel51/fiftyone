/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Loading } from "@fiftyone/components";
import { PluginScope } from "@fiftyone/plugins";
import PluginsRuntime from "@fiftyone/plugins/src/Runtime/PluginsRuntime";
import {
  Writer,
  setDataset,
  type setDatasetMutation,
  setGroupSlice,
  type setGroupSliceMutation,
  setSample,
  type setSampleMutation,
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
  useDatasetName,
} from "@fiftyone/state";
import type { Action } from "history";
import React, { useRef } from "react";
import { useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";
import {
  type Environment,
  type OperationType,
  commitMutation,
} from "relay-runtime";
import Setup from "./components/Setup";
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
import useWriters from "./useWriters";

export const SessionContext = React.createContext<Session>(SESSION_DEFAULT);

const DatasetPluginsRuntime = ({
  children,
}: {
  children?: React.ReactNode;
}) => {
  const datasetName = useDatasetName();
  const datasetLess = datasetName === null;

  return (
    <PluginsRuntime
      activeScope={
        datasetLess
          ? PluginScope.FIFTYONE_LANDING_PAGE
          : PluginScope.DATASET_SAMPLES_GRID
      }
      datasetLess={datasetLess}
      datasetName={datasetName ?? undefined}
      operatorContextSelector={fos.operatorContextSelector}
      useSpacesContext={fos.useSpacesContext}
    >
      {children}
    </PluginsRuntime>
  );
};

const Sync = ({ children }: { children?: React.ReactNode }) => {
  const environment = useRelayEnvironment();
  const subscription = useRecoilValue(stateSubscription);
  const router = useRouterContext();
  const sessionRef = useRef<Session>(SESSION_DEFAULT);
  const setters = useSetters(environment, router, sessionRef);
  useWriters(subscription, environment, router, sessionRef);

  const readyState = useEventSource(router, sessionRef);

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
          <DatasetPluginsRuntime>{children}</DatasetPluginsRuntime>
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

  session.modalSelector = nextEntry.state.modalSelector;

  if (
    currentEntry.state.event === "modal" ||
    nextEntry.state.event === "modal"
  ) {
    if (nextEntry.state.event !== "modal") {
      session.selectedLabels = [];
    }
    commitMutation<setSampleMutation>(environment, {
      mutation: setSample,
      variables: {
        groupId: nextEntry.state.modalSelector?.groupId,
        id: nextEntry.state.modalSelector?.id,
        subscription,
      },
    });
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

  session.modalSelector = nextEntry.state?.modalSelector;
  const updateSlice =
    currentEntry.state.groupSlice !== nextEntry.state.groupSlice;
  if (updateSlice) {
    session.sessionGroupSlice = nextEntry.state.groupSlice || undefined;
  }

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

        updateSlice &&
          commitMutation<setGroupSliceMutation>(environment, {
            mutation: setGroupSlice,
            variables: {
              slice: session.sessionGroupSlice,
              subscription,
            },
          });
      },
    });
};

export default Sync;
