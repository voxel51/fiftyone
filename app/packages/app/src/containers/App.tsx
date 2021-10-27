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
import socket, { handleId, isNotebook } from "../shared/connection";

import {
  useEventHandler,
  useMessageHandler,
  useSendMessage,
} from "../utils/hooks";

import Dataset from "./Dataset";
import Error from "./Error";
import Setup from "./Setup";

const useStateUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async ({ state }) => {
      const newSamples = new Set<string>(state.selected);
      const counter = await snapshot.getPromise(atoms.viewCounter);
      set(atoms.viewCounter, counter + 1);
      set(atoms.loading, false);
      set(atoms.selectedSamples, newSamples);
      set(atoms.stateDescription, toCamelCase(state) as State.Description);
      set(selectors.anyTagging, false);
      set(patching, false);
      set(similaritySorting, false);
      set(savingFilters, false);

      const colorPool = await snapshot.getPromise(atoms.colorPool);
      if (
        JSON.stringify(state.config.color_pool) !== JSON.stringify(colorPool)
      ) {
        set(atoms.colorPool, state.config.color_pool);
      }
    },
    []
  );
};

const useStatisticsUpdate = () => {
  return useRecoilCallback(
    ({ set }) => async ({ stats, view, extended, filters }) => {
      extended && set(atoms.extendedDatasetStatsRaw, { stats, view, filters });
      !extended && set(atoms.datasetStatsRaw, { stats, view });
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

  useMessageHandler("statistics", useStatisticsUpdate());
  useEventHandler(socket, "open", useOpen());

  useEventHandler(socket, "close", useClose());
  useMessageHandler("update", useStateUpdate());

  useMessageHandler("notification", (data) => addNotification.current(data));
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
