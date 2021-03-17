import React, { useState, useRef, Suspense } from "react";
import {
  useRecoilState,
  useSetRecoilState,
  useRecoilValue,
  useRecoilCallback,
} from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import NotificationHub from "../components/NotificationHub";

import Header from "../components/Header";
import Dataset from "./Dataset";

import {
  useEventHandler,
  useMessageHandler,
  useSendMessage,
} from "../utils/hooks";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket, { handleId, isNotebook } from "../shared/connection";

import Error from "./Error";
import Setup from "./Setup";
import "player51/src/css/player51.css";
import "../app.global.css";

const useStateUpdate = () => {
  return useRecoilCallback(({ snapshot, set, reset }) => async (state) => {
    const newSamples = new Set<string>(state.selected);
    const oldSamples = await snapshot.getPromise(atoms.selectedSamples);
    oldSamples.forEach(
      (s) => !newSamples.has(s) && reset(atoms.isSelectedSample(s))
    );
    newSamples.forEach(
      (s) => !oldSamples.has(s) && set(atoms.isSelectedSample(s), true)
    );

    set(atoms.selectedSamples, newSamples);
    set(atoms.stateDescription, state);
    set(selectors.anyTagging, false);
    const colorPool = await snapshot.getPromise(atoms.colorPool);
    if (JSON.stringify(state.config.color_pool) !== JSON.stringify(colorPool)) {
      set(atoms.colorPool, state.config.color_pool);
    }
  });
};

function App() {
  const addNotification = useRef(null);
  const [reset, setReset] = useState(false);
  const setConnected = useSetRecoilState(atoms.connected);
  const [loading, setLoading] = useRecoilState(atoms.loading);
  const setStateDescription = useSetRecoilState(atoms.stateDescription);
  const [viewCounterValue, setViewCounter] = useRecoilState(atoms.viewCounter);
  const setExtendedDatasetStats = useSetRecoilState(
    atoms.extendedDatasetStatsRaw
  );
  const setDatasetStats = useSetRecoilState(atoms.datasetStatsRaw);

  const handleStateUpdate = useStateUpdate();

  useMessageHandler("statistics", ({ stats, view, filters }) => {
    filters && setExtendedDatasetStats({ stats, view, filters });
    !filters && setDatasetStats({ stats, view });
  });

  useEventHandler(socket, "open", () => {
    setConnected(true);
    if (!loading) {
      setLoading(true);
    }
  });

  useEventHandler(socket, "close", () => {
    setConnected(false);
    setStateDescription({});
  });
  useMessageHandler("update", ({ state }) => {
    setViewCounter(viewCounterValue + 1);
    setLoading(false);
    handleStateUpdate(state);
  });

  useMessageHandler("notification", (data) => addNotification.current(data));
  const connected = useRecoilValue(atoms.connected);
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
      {connected && (
        <Suspense fallback={Setup}>
          <Dataset />
        </Suspense>
      )}
      {!connected && <Setup />}
      <NotificationHub children={(add) => (addNotification.current = add)} />
    </ErrorBoundary>
  );
}

export default App;
