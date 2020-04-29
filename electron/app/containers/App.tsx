import React, { ReactNode } from "react";
import { connect } from "react-redux";
import Sidebar from "../components/Sidebar";
import { updateState } from "../actions/update";
import io from "socket.io-client";

type Props = {
  children: ReactNode;
};

const mapStateToProps = (state = {}) => {
  return { ...state };
};
let socket;

class App extends React.Component {
  constructor(props: Props) {
    super(props);
    const { dispatch } = this.props;
    socket = io.connect("http://localhost:5151/state");
    socket.on("connect", () => console.log("connected"));

    socket.on("disconnect", () => console.log("disconnected"));
    socket.on("update", (data) => {
      dispatch(updateState(data));
    });
  }

  componentWillUnmount() {
    socket.disconnect();
  }

  render() {
    console.log(this.props);
    const { children } = this.props;
    return (
      <>
        <Sidebar />
        <div style={{ marginLeft: 260 }}>{children}</div>
      </>
    );
  }
}

export default connect(mapStateToProps)(App);
