import React, { createRef, useState } from "react";
import { Loader, Dimmer } from "semantic-ui-react";
import { Redirect } from "react-router-dom";

import routes from "../constants/routes.json";
import connect from "../utils/connect";

function Loading(props) {
  const { loading, connected } = props;
  if (!loading && connected) {
    return <Redirect to={routes.DATASET} />;
  } else if (!loading && !connected) {
    return <Redirect to={routes.SETUP} />;
  }
  return (
    <Dimmer active>
      <Loader />
    </Dimmer>
  );
}

export default connect(Loading);
