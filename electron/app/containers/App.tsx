import React, { ReactNode } from "react";
import { connect } from "react-redux";
import Sidebar from "../components/Sidebar";
import { updateState } from "../actions/update";
type Props = {
  children: ReactNode;
};

const mapStateToProps = (state = {}) => {
  return { ...state, socket: state.update.socket };
};

class App extends React.Component {
  constructor(props: Props) {
    super(props);
    console.log(props);
    const { dispatch, socket } = this.props;
    socket.on("connect", () => console.log("connected"));
    socket.on("disconnect", () => console.log("disconnected"));
    socket.on("update", (data) => {
      dispatch(updateState(data));
    });
  }

  componentWillUnmount() {
    //this.props.socket.disconnect();
  }

  render() {
    const { children, update } = this.props;
    return (
      <>
        <Sidebar update={update} />
        <div style={{ marginLeft: 260 }}>{children}</div>
      </>
    );
  }
}

export default connect(mapStateToProps)(App);
