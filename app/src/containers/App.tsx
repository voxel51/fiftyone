import React, { useState, useRef, Suspense } from "react";
import { useRecoilState, useSetRecoilState, useRecoilValue } from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import NotificationHub from "../components/NotificationHub";

import styled from "styled-components";

import "player51/src/css/player51.css";
import Header from "../components/Header";
import Dataset from "./Dataset";

import { useEventHandler, useMessageHandler } from "../utils/hooks";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { convertSelectedObjectsListToMap } from "../utils/selection";

import Error from "./Error";
import { scrollbarStyles } from "../components/utils";
import Setup from "./Setup";

const Body = styled.div`
  ${scrollbarStyles}
  padding: 0;
  flex-grow: 1;
  display: flex:
  flex-direction: column;
`;

function App() {
  const addNotification = useRef(null);
  const [reset, setReset] = useState(false);
  const setConnected = useSetRecoilState(atoms.connected);
  const [loading, setLoading] = useRecoilState(atoms.loading);
  const socket = useRecoilValue(selectors.socket);
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const setSelectedSamples = useSetRecoilState(atoms.selectedSamples);
  const [viewCounterValue, setViewCounter] = useRecoilState(atoms.viewCounter);
  const setSelectedObjects = useSetRecoilState(atoms.selectedObjects);
  const setDatasetStatsLoading = useSetRecoilState(atoms.datasetStatsLoading);
  const setExtendedatasetStatsLoading = useSetRecoilState(
    atoms.extendedDatasetStatsLoading
  );
  const handleStateUpdate = (state) => {
    setStateDescription(state);
    setSelectedSamples(new Set(state.selected));
    setSelectedObjects(convertSelectedObjectsListToMap(state.selected_objects));
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
    setDatasetStatsLoading(true);
    Object.keys(stateDescription.filters ?? []).length &&
      setExtendedatasetStatsLoading(true);
    setLoading(false);
    handleStateUpdate(state);
  });

  useMessageHandler("notification", (data) => addNotification.current(data));
  const connected = useRecoilValue(atoms.connected);

  return (
    <ErrorBoundary
      FallbackComponent={Error}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Header />
      <Body style={{ overflowY: connected ? "hidden" : "scroll" }}>
        {connected && (
          <Suspense fallback={Setup}>
            <Dataset />
          </Suspense>
        )}
        {!connected && <Setup />}
      </Body>
      <NotificationHub children={(add) => (addNotification.current = add)} />
    </ErrorBoundary>
  );
}

export default App;
