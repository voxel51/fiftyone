import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Button, Modal, Label } from "semantic-ui-react";

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

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { loading, children, dispatch, update, connected, port } = props;
  const portRef = useRef();
  const [result, setResultFromForm] = useState({ port, connected });
  const [socket, setSocket] = useState(getSocket(result.port, "state"));

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
  useSubscribe(socket, "disconnect", () => console.log("disconnected"));
  useSubscribe(socket, "update", (data) => {
    if (data.close) {
      remote.getCurrentWindow().close();
    }
    dispatch(updateState(data));
  });

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });
  const bodyStyle = { height: "100%", padding: "1em" };
  if (connected) bodyStyle.marginLeft = 260;

  return (
    <>
      <Modal
        trigger={<Button style={{ display: "none" }} ref={portRef}></Button>}
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
      <Sidebar />
      <div style={bodyStyle}>{children}</div>
    </>
  );
}

export default connect(App);
