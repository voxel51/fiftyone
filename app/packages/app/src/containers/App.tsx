import React, { useState, useRef, Suspense } from "react";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import { ErrorBoundary, useErrorHandler } from "react-error-boundary";

import { toCamelCase } from "@fiftyone/utilities";

import "../app.global.css";

import { patching } from "../components/Actions/Patcher";
import { similaritySorting } from "../components/Actions/Similar";
import { savingFilters } from "../components/Actions/ActionsRow";
import Header from "../components/Header";
import NotificationHub from "../components/NotificationHub";
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
import Setup from "./Setup";
import { resolveGroups, sidebarGroupsDefinition } from "../components/Sidebar";
import { aggregationsTick } from "../recoil/aggregations";

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
      set(atoms.stateDescription, {
        ...state,
        filters: filters as State.Filters,
      } as State.Description);
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
        const groups = resolveGroups(state.dataset);
        const current = get(sidebarGroupsDefinition(false));

        if (JSON.stringify(groups) !== JSON.stringify(current)) {
          set(sidebarGroupsDefinition(false), groups);
          set(aggregationsTick, get(aggregationsTick) + 1);
        }
      }

      const colorPool = get(atoms.colorPool);
      if (
        JSON.stringify(state.config.colorPool) !== JSON.stringify(colorPool)
      ) {
        set(atoms.colorPool, state.config.colorPool);
      }
    },
    []
  );
};

const useOpen = () => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      set(atoms.loading, true);
      const loading = await snapshot.getPromise(atoms.loading);
      !loading && set(atoms.connected, true);
    },
    []
  );
};

const useClose = () => {
  const clearModal = useClearModal();
  return useRecoilCallback(
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
  useEventHandler(socket, "open", useOpen());

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

  return (
    <>
      <Header addNotification={addNotification} />
      <Suspense fallback={<Setup />}>
        <Dataset />
      </Suspense>
      <NotificationHub children={(add) => (addNotification.current = add)} />
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
