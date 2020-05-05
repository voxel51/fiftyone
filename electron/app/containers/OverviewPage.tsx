import React from "react";

import Overview from "../components/Overview";
import connect from "../utils/connect";

function OverviewPage(props) {
  return <Overview {...props.socket} />;
}

export default connect(OverviewPage);
