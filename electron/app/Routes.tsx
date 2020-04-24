import React from "react";
import { Switch, Route } from "react-router-dom";
import routes from "./constants/routes.json";
import App from "./containers/App";
import OverviewPage from "./containers/OverviewPage";

export default function Routes() {
  return (
    <App>
      <Switch>
        <Route path={routes.OVERVIEW} component={OverviewPage} />
      </Switch>
    </App>
  );
}
