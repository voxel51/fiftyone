import React, { useState, useRef, Suspense } from "react";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { ErrorBoundary, useErrorHandler } from "react-error-boundary";

import { toCamelCase } from "@fiftyone/utilities";

import { patching } from "../components/Actions/Patcher";
import { similaritySorting } from "../components/Actions/Similar";
import { savingFilters } from "../components/Actions/ActionsRow";
import Header from "../components/Header";
import TeamsForm from "../components/TeamsForm";

import * as aggregationAtoms from "../recoil/aggregations";
import * as atoms from "../recoil/atoms";
import { State } from "../recoil/types";
import { useClearModal } from "../recoil/utils";
import * as viewAtoms from "../recoil/view";
import socket, { handleId, isNotebook } from "../shared/connection";
import {
  useEventHandler,
  useMessageHandler,
  useSendMessage,
} from "../utils/hooks";
import { viewsAreEqual } from "../utils/view";

import Dataset from "./Dataset";
import ErrorPage from "./Error";
import { resolveGroups, sidebarGroupsDefinition } from "../components/Sidebar";
import Loading from "../components/Loading";
import Setup from "./Setup";

const useStateUpdate = () => {
  return useRecoilTransaction_UNSTABLE(
    ({ get, set }) => async ({ state: { filters, ...data } }) => {
      const state = toCamelCase(data) as State.Description;
      const newSamples = new Set<string>(state.selected);
      const counter = get(atoms.viewCounter);
      const view = get(viewAtoms.view);

      set(atoms.viewCounter, counter + 1);
      set(atoms.loading, false);
      set(atoms.selectedSamples, newSamples);

      [true, false].forEach((i) =>
        [true, false].forEach((j) =>
          set(atoms.tagging({ modal: i, labels: j }), false)
        )
      );
      set(patching, false);
      set(similaritySorting, false);
      set(savingFilters, false);
      if (!viewsAreEqual(view, state.view || [])) {
        set(viewAtoms.view, state.view || []);
      }

      if (state.dataset) {
        state.dataset.brainMethods = Object.values(
          state.dataset.brainMethods || {}
        );
        state.dataset.evaluations = Object.values(
          state.dataset.evaluations || {}
        );

        state.dataset.annotationRuns = Object.values(
          state.dataset.annotationRuns || {}
        );
        const groups = resolveGroups(state.dataset);
        const current = get(sidebarGroupsDefinition(false));

        if (JSON.stringify(groups) !== JSON.stringify(current)) {
          set(sidebarGroupsDefinition(false), groups);
          set(
            aggregationAtoms.aggregationsTick,
            get(aggregationAtoms.aggregationsTick) + 1
          );
        }
      }

      const colorPool = get(atoms.colorPool);
      if (
        JSON.stringify(state.config.colorPool) !== JSON.stringify(colorPool)
      ) {
        set(atoms.colorPool, state.config.colorPool);
      }
      set(atoms.connected, true);

      set(atoms.stateDescription, {
        ...state,
        filters: filters as State.Filters,
      } as State.Description);
    },
    []
  );
};

const useClose = () => {
  const clearModal = useClearModal();
  return useRecoilTransaction_UNSTABLE(
    ({ reset, set }) => async () => {
      clearModal();
      set(atoms.connected, false);
      reset(atoms.stateDescription);
    },
    []
  );
};

const Container = () => {
  const addNotification = useRef(null);
  const connected = useRecoilValue(atoms.connected);

  useEventHandler(socket, "close", useClose());
  useMessageHandler("update", useStateUpdate());

  useSendMessage("as_app", {
    notebook: isNotebook,
    handle: handleId,
  });

  const handleError = useErrorHandler();

  useMessageHandler("error", (data) => {
    handleError(data);
  });
  const { open: teamsOpen } = useRecoilValue(atoms.teams);

  return (
    <>
      <Header addNotification={addNotification} />
      {connected ? (
        <Suspense fallback={<Loading text={"Loading..."} />}>
          <Dataset />
        </Suspense>
      ) : (
        <Setup />
      )}
      {teamsOpen && <TeamsForm />}
    </>
  );
};

const App = () => {
  const [reset, setReset] = useState(false);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorPage}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Container />
    </ErrorBoundary>
  );
};

export default App;
