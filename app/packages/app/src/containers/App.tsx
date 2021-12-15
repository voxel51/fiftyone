import React, { useState, useRef, Suspense } from "react";
import { useRecoilCallback } from "recoil";
import { ErrorBoundary } from "react-error-boundary";

import { toCamelCase } from "@fiftyone/utilities";

import "../app.global.css";

import { patching } from "../components/Actions/Patcher";
import { similaritySorting } from "../components/Actions/Similar";
import { savingFilters } from "../components/Actions/ActionsRow";
import Header from "../components/Header";
import NotificationHub from "../components/NotificationHub";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
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
import Error from "./Error";
import Setup from "./Setup";
import { resolveGroups, sidebarGroupsDefinition } from "../components/Sidebar";

const useStateUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async ({ state: { filters, ...data } }) => {
      const state = toCamelCase(data) as State.Description;
      const newSamples = new Set<string>(state.selected);
      const counter = await snapshot.getPromise(atoms.viewCounter);
      const view = await snapshot.getPromise(viewAtoms.view);
      set(atoms.viewCounter, counter + 1);
      set(atoms.loading, false);
      set(atoms.selectedSamples, newSamples);
      set(atoms.stateDescription, {
        ...state,
        filters: filters as State.Filters,
      } as State.Description);
      set(selectors.anyTagging, false);
      set(patching, false);
      set(similaritySorting, false);
      set(savingFilters, false);
      if (!viewsAreEqual(view, state.view || [])) {
        set(viewAtoms.view, state.view || []);
      }

      if (state.dataset) {
        const groupDefinition = resolveGroups(state.dataset);

        const current = await snapshot.getPromise(
          sidebarGroupsDefinition(false)
        );

        if (JSON.stringify(groupDefinition) !== JSON.stringify(current)) {
          set(sidebarGroupsDefinition(false), groupDefinition);
        }
      }

      const colorPool = await snapshot.getPromise(atoms.colorPool);
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

function App() {
  const addNotification = useRef(null);
  const [reset, setReset] = useState(false);
  useEventHandler(socket, "open", useOpen());

  useEventHandler(socket, "close", useClose());
  useMessageHandler("update", useStateUpdate());

  useMessageHandler("error", (data) => console.log(data));
  useSendMessage("as_app", {
    notebook: isNotebook,
    handle: handleId,
  });

  return (
    <ErrorBoundary
      FallbackComponent={Error}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Header addNotification={addNotification} />
      <Suspense fallback={<Setup />}>
        <Dataset />
      </Suspense>
      <NotificationHub children={(add) => (addNotification.current = add)} />
    </ErrorBoundary>
  );
}

export default App;
