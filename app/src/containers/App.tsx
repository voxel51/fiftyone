import React, { ReactNode, useState, useRef, useEffect } from "react";
import { useRecoilState, useSetRecoilState, useRecoilValue } from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import NotificationHub from "../components/NotificationHub";
import ReactGA from "react-ga";
import styled from "styled-components";

import Header from "../components/Header";
import PortForm from "../components/PortForm";

import {
  useEventHandler,
  useHashChangeHandler,
  useMessageHandler,
} from "../utils/hooks";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { convertSelectedObjectsListToMap } from "../utils/selection";
import gaConfig from "../constants/ga.json";
import Error from "./Error";
import { scrollbarStyles } from "../components/utils";

type Props = {
  children: ReactNode;
};

const Body = styled.div`
  ${scrollbarStyles}
  padding: 0;
  overflow-y: hidden;
  flex-grow: 1;
  display: flex:
  flex-direction: column;
`;

const useGA = () => {
  const [gaInitialized, setGAInitialized] = useState(false);
  useMessageHandler("fiftyone", (info) => {
    const dev = process.env.NODE_ENV == "development";
    const buildType = dev ? "dev" : "prod";

    ReactGA.initialize(gaConfig.app_ids[buildType], {
      debug: dev,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.user_id,
      },
    });
    ReactGA.set({
      userId: info.user_id,
      checkProtocolTask: null, // disable check, allow file:// URLs
      [gaConfig.dimensions.dev]: buildType,
      [gaConfig.dimensions.version]: info.version,
    });
    setGAInitialized(true);
    ReactGA.pageview(window.location.hash.replace(/^#/, ""));
  });
  useHashChangeHandler(() => {
    if (gaInitialized) {
      ReactGA.pageview(window.location.hash.replace(/^#/, ""));
    }
  }, [window.location.hash]);
};

function App(props: Props) {
  const addNotification = useRef(null);
  const [reset, setReset] = useState(false);
  const { children } = props;
  const portRef = useRef();
  const [port, setPort] = useRecoilState(atoms.port);
  const [connected, setConnected] = useRecoilState(atoms.connected);
  const [loading, setLoading] = useRecoilState(atoms.loading);
  const socket = useRecoilValue(selectors.socket);
  const setStateDescription = useSetRecoilState(atoms.stateDescription);
  const setSelectedSamples = useSetRecoilState(atoms.selectedSamples);
  const [viewCounterValue, setViewCounter] = useRecoilState(atoms.viewCounter);
  const [result, setResultFromForm] = useState({ port, connected });
  const setSelectedObjects = useSetRecoilState(atoms.selectedObjects);
  const setDatasetStats = useSetRecoilState(atoms.datasetStats);
  const setDExtendedatasetStats = useSetRecoilState(atoms.extendedDatasetStats);

  useGA();
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
  });
  useMessageHandler("update", ({ state }) => {
    setViewCounter(viewCounterValue + 1);
    setDatasetStats([]);
    setDExtendedatasetStats([]);
    setLoading(false);
    handleStateUpdate(state);
  });

  useMessageHandler("notification", (data) => addNotification.current(data));

  return (
    <ErrorBoundary
      FallbackComponent={Error}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Header />
      <Body>{children}</Body>
      <NotificationHub children={(add) => (addNotification.current = add)} />
    </ErrorBoundary>
  );
}

export default App;
