import React, { Suspense } from "react";
import { HashRouter, Switch, Route } from "react-router-dom";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";

function Routes() {
  return (
    <Suspense fallback={<Setup />}>
      <App>
        <HashRouter>
          <Switch>
            <Route path={routes.SETUP} exact component={Setup} />
            <Route path={routes.DATASET} component={Dataset} />
          </Switch>
        </HashRouter>
      </App>
    </Suspense>
  );
}

export default Routes;
