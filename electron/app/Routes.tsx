import React from "react";
import { Switch, Route } from "react-router-dom";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";
import Loading from "./containers/Loading";

export default function Routes() {
  return (
    <App>
      <Switch>
        <Route path={routes.LOADING} exact component={Loading} />
        <Route path={routes.SETUP} exact component={Setup} />
        <Route path={routes.DATASET} exact component={Dataset} />
        <Route path={routes.LIST} exact component={Dataset} />
        <Route path={routes.CHARTS} exact component={Dataset} />
      </Switch>
    </App>
  );
}
