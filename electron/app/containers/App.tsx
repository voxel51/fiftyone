import { remote, ipcRenderer } from "electron";
import React, { ReactNode, useState, useRef } from "react";
import { Button, Modal, Label } from "semantic-ui-react";

import Sidebar from "../components/Sidebar";
import PortForm from "../components/PortForm";
import { updateState, updateConnected, updatePort } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

type Props = {
  children: ReactNode;
};

function App(props: Props) {
  const { children, dispatch, update, connected, port } = props;
  const [connectionEstablished, setConnectionEstablished] = useState(false);
  const portRef = useRef();
  const socket = getSocket(port, "state");
  const [portFromForm, setPortFromForm] = useState(port);

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

  return (
    <>
      <Modal
        trigger={<Button style={{ display: "none" }} ref={portRef}></Button>}
        size="tiny"
        onClose={() => dispatch(updatePort(portFromForm))}
      >
        <Modal.Header>Port number</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <PortForm
              setPort={setPortFromForm}
              connected={connected}
              port={port}
              resolving={false}
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
