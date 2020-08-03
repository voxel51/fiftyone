import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useEffect, useRef } from "react";
import ReactGA from "react-ga";
import { Button, Modal, Label } from "semantic-ui-react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import PortForm from "../components/PortForm";
import {
  updateState,
  updateConnected,
  updatePort,
  updateLoading,
} from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";
import gaConfig from "../constants/ga.json";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { path, url } = useRouteMatch();
  const [showInfo, setShowInfo] = useState(true);
  const {
    loading,
    children,
    dispatch,
    update,
    connected,
    port,
    displayProps,
  } = props;
  const portRef = useRef();
  const [result, setResultFromForm] = useState({ port, connected });
  const [socket, setSocket] = useState(getSocket(result.port, "state"));
  const [gaInitialized, setGAInitialized] = useState(false);
  useEffect(() => {
    const dev = process.env.NODE_ENV == "development";
    socket.emit("get_fiftyone_info", (info) => {
      ReactGA.initialize(gaConfig.ID, {
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
        [gaConfig.dimensions.dev]: dev ? "dev" : "prod",
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
        dispatch(updateState(data));
        dispatch(updateLoading(false));
      });
    }
  });
  if (socket.connected && !connected) {
    dispatch(updateConnected(true));
    dispatch(updateLoading(true));
    socket.emit("get_current_state", "", (data) => {
      dispatch(updateState(data));
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
    dispatch(updateState(data));
  });

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });
  const bodyStyle = {
    height: "100%",
    marginLeft: 260,
    padding: "0 2rem 2rem 2rem",
  };

  return (
    <>
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
      <Sidebar displayProps={displayProps} />
      <div className={showInfo ? "" : "hide-info"} style={bodyStyle}>
        {children}
      </div>
    </>
  );
}

export default connect(App);
