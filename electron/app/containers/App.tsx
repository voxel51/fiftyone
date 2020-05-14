import { remote } from "electron";
import React, { ReactNode, useState } from "react";

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
  const socket = getSocket("state");
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

  return (
    <>
      <Sidebar />
      <div style={{ marginLeft: 260, height: "100%" }}>{children}</div>
    </>
  );
}

export default connect(App);
