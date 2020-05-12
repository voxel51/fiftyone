import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Sidebar, Button, Modal, Input } from "semantic-ui-react";

import Navbar from "../components/Sidebar";
import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { children, dispatch, update } = props;
  const [connectionEstablished, setConnectionEstablished] = useState(false);
  const portRef = useRef(null);
  const [port, setPort] = useState(5151);
  const socket = getSocket(port, "state");
  useSubscribe(socket, "connect", () => {
    console.log("connected");
    if (!connectionEstablished) {
      socket.emit("get_current_state", "", (data) => {
        dispatch(updateState(data));
      });
      setConnectionEstablished(true);
    }
  });
  useSubscribe(socket, "disconnect", () => alert("sfgs"));
  useSubscribe(socket, "update", (data) => {
    if (data.close) {
      remote.getCurrentWindow().close();
    }
    dispatch(updateState(data));
  });

  ipcRenderer.on("update-session-config", (event, message) => {
    portRef.current.ref.current.click();
  });

  return (
    <>
      <Modal
        trigger={<Button style={{ display: "none" }} ref={portRef}></Button>}
      >
        <Modal.Header>Server Address</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <Input value={port} loading />
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Sidebar.Pushable>
        <Navbar />
        <Sidebar.Pusher>{children}</Sidebar.Pusher>
      </Sidebar.Pushable>
    </>
  );
}

export default connect(App);
