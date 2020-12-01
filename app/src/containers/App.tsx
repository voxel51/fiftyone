import React, { ReactNode, useState, useRef, useEffect } from "react";
import { useRecoilState, useSetRecoilState, useRecoilValue } from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import NotificationHub from "../components/NotificationHub";
import ReactGA from "react-ga";
import styled from "styled-components";

import "player51/src/css/player51.css";
import Header from "../components/Header";
import PortForm from "../components/PortForm";

import {
  useEventHandler,
  useHashChangeHandler,
  useMessageHandler,
} from "../utils/hooks";
import { attachDisposableHandler, packageMessage } from "../utils/socket";
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
  const socket = useRecoilValue(selectors.socket);

  useEffect(() => {
    attachDisposableHandler(socket, "fiftyone", ({ data: info }) => {
      const dev = import.meta.env.MODE == "development";
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
    socket.send(packageMessage("fiftyone", {}));
  }, []);
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
