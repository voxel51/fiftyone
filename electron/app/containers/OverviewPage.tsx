import React from "react";
import { connect } from "react-redux";

import Overview from "../components/Overview";

const mapStateToProps = (state) => {
  return {
    state: state.update.state,
  };
};

function OverviewPage(props) {
  return <Overview state={props.state} />;
}

export default connect(mapStateToProps)(OverviewPage);
