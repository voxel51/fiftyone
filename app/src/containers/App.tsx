import React, { useState, useRef, Suspense } from "react";
import { useRecoilState, useSetRecoilState, useRecoilValue } from "recoil";
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
import { convertSelectedObjectsListToMap } from "../utils/selection";

import Error from "./Error";
import Setup from "./Setup";
import "player51/src/css/player51.css";
import "../app.global.css";

function App() {
  const addNotification = useRef(null);
  const [reset, setReset] = useState(false);
  const setConnected = useSetRecoilState(atoms.connected);
  const [loading, setLoading] = useRecoilState(atoms.loading);
  const socket = useRecoilValue(selectors.socket);
  const setStateDescription = useSetRecoilState(atoms.stateDescription);
  const setSelectedSamples = useSetRecoilState(atoms.selectedSamples);
  const [viewCounterValue, setViewCounter] = useRecoilState(atoms.viewCounter);
  const setSelectedObjects = useSetRecoilState(atoms.selectedObjects);
  const handle = useRecoilValue(selectors.handleId);
  const isNotebook = useRecoilValue(selectors.isNotebook);
  const handleStateUpdate = (state) => {
    setStateDescription(state);
    setSelectedSamples(new Set(state.selected));
    setSelectedObjects(convertSelectedObjectsListToMap(state.selected_labels));
  };

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
    handle,
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
