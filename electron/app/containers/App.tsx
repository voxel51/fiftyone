import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useEffect, useRef } from "react";
import { Button, Modal } from "semantic-ui-react";
import { useRecoilState, useSetRecoilState, useRecoilValue } from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import NotificationHub from "../components/NotificationHub";
import ReactGA from "react-ga";

import Header from "../components/Header";
import PortForm from "../components/PortForm";

import { useHashChangeHandler } from "../utils/hooks";
import { useSubscribe } from "../utils/socket";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { convertSelectedObjectsListToMap } from "../utils/selection";
import gaConfig from "../constants/ga.json";
import Error from "./Error";

type Props = {
  children: ReactNode;
};

const useGA = (socket) => {
  const [gaInitialized, setGAInitialized] = useState(false);
  useEffect(() => {
    const dev = process.env.NODE_ENV == "development";
    const buildType = dev ? "dev" : "prod";
    socket.emit("get_fiftyone_info", (info) => {
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
  }, []);
  useHashChangeHandler(() => {
    if (gaInitialized) {
      ReactGA.pageview(window.location.hash.replace(/^#/, ""));
    }
  }, [window.location.hash]);
};

function App(props: Props) {
  const [showInfo] = useState(true);
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
  const setDatasetStats = useSetRecoilState(atoms.datasetStats);
  const setSelectedObjects = useSetRecoilState(atoms.selectedObjects);
  const setExtendedDatasetStats = useSetRecoilState(atoms.extendedDatasetStats);

  useGA(socket);
  const getStats = (extended) => {
    socket.emit("get_statistics", extended, (d) => {
      extended ? setExtendedDatasetStats(d) : setDatasetStats(d);
    });
  };
  const handleStateUpdate = (data) => {
    setStateDescription(data);
    setSelectedSamples(new Set(data.selected));
    setSelectedObjects(convertSelectedObjectsListToMap(data.selected_objects));
  };

  useSubscribe(socket, "connect", () => {
    setConnected(true);
    if (!loading) {
      setLoading(true);
      getStats(false);
      socket.emit("get_current_state", "", (data) => {
        handleStateUpdate(data);
        setLoading(false);
      });
    }
  });
  if (socket.connected && !connected) {
    setConnected(true);
    setLoading(true);
    getStats(false);
    socket.emit("get_current_state", "", (data) => {
      setViewCounter(viewCounterValue + 1);
      handleStateUpdate(data);
      setLoading(false);
    });
  }
  setTimeout(() => {
    if (loading && !connected) {
      setLoading(false);
    }
  }, 250);
  useSubscribe(socket, "disconnect", () => {
    setConnected(false);
  });
  useSubscribe(socket, "update", (data) => {
    setViewCounter(viewCounterValue + 1);
    if (data.close) {
      remote.getCurrentWindow().close();
    }
    getStats(false);
    handleStateUpdate(data);
  });

  useSubscribe(socket, "notification", (data) => {
    addNotification.current(data);
  });

  useEffect(() => {
    if (reset) {
      getStats(false);
      socket.emit("get_current_state", "", (data) => {
        handleStateUpdate(data);
        setLoading(false);
      });
    }
  }, [reset]);

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });
  const bodyStyle = {
    padding: "0 2rem 2rem 2rem",
  };
  return (
    <ErrorBoundary
      FallbackComponent={Error}
      onReset={() => setReset(true)}
      resetKeys={[reset]}
    >
      <Header />
      <div className={showInfo ? "" : "hide-info"} style={bodyStyle}>
        {children}
        <Modal
          trigger={
            <Button
              style={{ padding: "1rem", display: "none" }}
              ref={portRef}
            ></Button>
          }
          size="tiny"
          onClose={() => setPort(result.port)}
        >
          <Modal.Header>Port number</Modal.Header>
          <Modal.Content>
            <Modal.Description>
              <PortForm
                setResult={setResultFromForm}
                connected={connected}
                port={port}
                invalid={false}
              />
            </Modal.Description>
          </Modal.Content>
        </Modal>
      </div>
      <NotificationHub children={(add) => (addNotification.current = add)} />
    </ErrorBoundary>
  );
}

export default App;
