import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useEffect, useRef } from "react";
import ReactGA from "react-ga";
import { Button, Modal, Label } from "semantic-ui-react";
import { useSetRecoilState } from "recoil";
import { ErrorBoundary } from "react-error-boundary";
import { GlobalStyle, ThemeProvider } from "styled-components";

import Header from "../components/Header";
import PortForm from "../components/PortForm";
import { updatePort } from "../actions/update";

import { updateState, updateConnected, updateLoading } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";
import { stateDescription, selectedSamples } from "../recoil/atoms";
import gaConfig from "../constants/ga.json";
import Error from "./Error";
import { darkTheme } from "../shared/colors";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const [showInfo, setShowInfo] = useState(true);
  const [reset, setReset] = useState(false);
  const { loading, children, dispatch, connected, port } = props;
  const portRef = useRef();
  const [result, setResultFromForm] = useState({ port, connected });
  const [socket, setSocket] = useState(getSocket(result.port, "state"));
  const setStateDescription = useSetRecoilState(stateDescription);
  const setSelectedSamples = useSetRecoilState(selectedSamples);

  const handleStateUpdate = (data) => {
    setStateDescription(data);
    setSelectedSamples(new Set(data.selected));
    dispatch(updateState(data));
  };

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
  useEffect(() => {
    if (gaInitialized) {
      ReactGA.pageview(window.location.hash.replace(/^#/, ""));
    }
  }, [window.location.hash]);
  useSubscribe(socket, "connect", () => {
    dispatch(updateConnected(true));
    if (loading) {
      socket.emit("get_current_state", "", (data) => {
        handleStateUpdate(data);
        dispatch(updateLoading(false));
      });
    }
  });
  if (socket.connected && !connected) {
    dispatch(updateConnected(true));
    dispatch(updateLoading(true));
    socket.emit("get_current_state", "", (data) => {
      handleStateUpdate(data);
      dispatch(updateLoading(false));
    });
  }
  setTimeout(() => {
    if (loading && !connected) {
      dispatch(updateLoading(false));
    }
  }, 250);
  useSubscribe(socket, "disconnect", () => {
    dispatch(updateConnected(false));
  });
  useSubscribe(socket, "update", (data) => {
    if (data.close) {
      remote.getCurrentWindow().close();
    }
    handleStateUpdate(data);
  });

  useEffect(() => {
    if (reset) {
      socket.emit("get_current_state", "", (data) => {
        handleStateUpdate(data);
        dispatch(updateLoading(false));
      });
    }
  }, [reset]);

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });
  const bodyStyle = {
    height: "100%",
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
          onClose={() => {
            dispatch(updatePort(result.port));
            setSocket(getSocket(result.port, "state"));
          }}
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
    </ErrorBoundary>
  );
}

export default connect(App);
