import React from "react";
import { connect } from "react-redux";

import Overview from "../components/Overview";

const mapStateToProps = (state) => {
  return {
    state: state.update.state,
    socket: state.update.socket,
  };
};

function OverviewPage(props) {
  return <Overview state={props.state} socket={props.socket} />;
}

export default connect(mapStateToProps)(OverviewPage);
