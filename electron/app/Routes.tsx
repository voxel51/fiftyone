import React from "react";
import { Switch, Route } from "react-router-dom";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";

export default function Routes() {
  return (
    <App>
      <Switch>
        <Route path={routes.SETUP} component={Setup} />
        <Route path={routes.DATASET} component={Dataset} />
        <Route path={routes.LIST} component={Dataset} />
        <Route path={routes.CHARTS} component={Dataset} />
      </Switch>
    </App>
  );
}
