import { Loading } from "@fiftyone/components";
import { usePlugins } from "@fiftyone/plugins";
import {
  setDataset,
  setGroupSlice,
  setSample,
  setSpaces,
  setView,
  Writer,
  type setDatasetMutation,
  type setGroupSliceMutation,
  type setSampleMutation,
  type setSpacesMutation,
  type setViewMutation,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  SESSION_DEFAULT,
  stateSubscription,
  type Session,
} from "@fiftyone/state";
import type { Action } from "history";
import React, { useRef } from "react";
import { useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";
import {
  commitMutation,
  type Environment,
  type OperationType,
} from "relay-runtime";
import Setup from "./components/Setup";
import type {
  DatasetPageQuery,
  DatasetPageQuery$data,
} from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import type { IndexPageQuery } from "./pages/__generated__/IndexPageQuery.graphql";
import { useRouterContext, type Entry } from "./routing";
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

  session.modalSelector = nextEntry.state?.modalSelector;
  const updateSlice =
    currentEntry.state.groupSlice !== nextEntry.state.groupSlice;
  if (updateSlice) {
    session.sessionGroupSlice = nextEntry.state.groupSlice || undefined;
  }

  let update = !fos.viewsAreEqual(
    currentEntry.state.view,
    nextEntry.state.view
  );
  if (currentDataset !== nextDataset) {
    update = true;
    session.colorScheme = fos.ensureColorScheme(
      data.dataset?.appConfig?.colorScheme,
      data.config
    );
    session.fieldVisibilityStage = nextEntry.state.fieldVisibility;
    session.sessionSpaces = nextEntry.state?.workspace ?? fos.SPACES_DEFAULT;
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
