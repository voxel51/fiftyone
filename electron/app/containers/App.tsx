import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Button, Modal, Label } from "semantic-ui-react";

import Sidebar from "../components/Sidebar";
import PortForm from "../components/PortForm";
import { updateState, updateConnected } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { children, dispatch, update, connected, port } = props;
  const [connectionEstablished, setConnectionEstablished] = useState(false);
  const portRef = useRef(null);
  const socket = getSocket(port, "state");
  useSubscribe(socket, "connect", () => {
    dispatch(updateConnected(true));
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
    portRef.current.ref.current.click();
  });
  const bodyStyle = { height: "100%", padding: "1em" };
  if (connected) bodyStyle.marginLeft = 260;
  const portPattern =
    "^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$";

  return (
    <>
      <Modal
        trigger={<Button style={{ display: "none" }} ref={portRef}></Button>}
        size="tiny"
      >
        <Modal.Header>Port number</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <PortForm />
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Sidebar />
      <div style={bodyStyle}>{children}</div>
    </>
  );
}

export default connect(App);
