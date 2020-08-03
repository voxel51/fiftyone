import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Button, Modal, Label } from "semantic-ui-react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import { useSetRecoilState } from "recoil";
import { ThemeProvider } from "styled-components";

import { GlobalStyle } from "../shared/global";
import { darkTheme } from "../shared/colors";
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
import { stateDescription } from "../recoil/atoms";

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
  const setStateDescription = useSetRecoilState(stateDescription);

  const handleStateUpdate = (data) => {
    setStateDescription(data);
    dispatch(updateState(data));
  };

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

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });
  const bodyStyle = {
    height: "100%",
    padding: "0 2rem 2rem 2rem",
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <GlobalStyle />
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
      <div className={showInfo ? "" : "hide-info"} style={bodyStyle}>
        {children}
      </div>
    </ThemeProvider>
  );
}

export default connect(App);
