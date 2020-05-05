import React, { ReactNode, useState } from "react";
import { connect } from "react-redux";
import Sidebar from "../components/Sidebar";
import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";

type Props = {
  children: ReactNode;
};

const mapStateToProps = (state = {}) => {
  return { ...state };
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
    dispatch(updateState(data));
  });

  return (
    <>
      <Sidebar update={update} />
      <div style={{ marginLeft: 260 }}>{children}</div>
    </>
  );
}

export default connect(mapStateToProps)(App);
