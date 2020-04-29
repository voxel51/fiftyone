import React, { ReactNode } from "react";
import Sidebar from "../components/Sidebar";
import socketio from "../socketio/socketio";

type Props = {
  children: ReactNode;
};

let socket;

export default class App extends React.Component {
  constructor(props: Props) {
    super(props);
    socket = socketio();
  }

  componentWillUnmount() {
    socket.disconnect();
  }

  render() {
    const { children } = props;
    return (
      <>
        <Sidebar />
        <div style={{ marginLeft: 260 }}>{children}</div>
      </>
    );
  }
}
