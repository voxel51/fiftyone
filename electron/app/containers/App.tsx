import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Button, Modal, Input } from "semantic-ui-react";

import Sidebar from "../components/Sidebar";
import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { children, dispatch, update } = props;
  const [connectionEstablished, setConnectionEstablished] = useState(false);
  const settingsRef = useRef(null);
  const [server, setServer] = useState("http://127.0.0.1:5151/");
  const socket = getSocket(server, "state");
  useSubscribe(socket, "connect", () => {
    console.log("connected");
    if (!connectionEstablished) {
      socket.emit("get_current_state", "", (data) => {
        dispatch(updateState(data));
      });
      setConnectionEstablished(true);
    }
  });
  useSubscribe(socket, "disconnect", () => console.log("disconnected"));
  useSubscribe(socket, "update", (data) => {
    if (data.close) {
      remote.getCurrentWindow().close();
    }
    dispatch(updateState(data));
  });

  ipcRenderer.on("update-session-config", (event, message) => {
    settingsRef.current.ref.current.click();
  });

  return (
    <>
      <Modal
        trigger={
          <Button style={{ display: "none" }} ref={settingsRef}></Button>
        }
      >
        <Modal.Header>Server Address</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <Input value={server} loading />
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Sidebar />
      <div style={{ marginLeft: 260, height: "100%" }}>{children}</div>
    </>
  );
}

export default connect(App);
