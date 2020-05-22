import React, { useState } from "react";
import { Switch, Route } from "react-router-dom";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";
import Loading from "./containers/Loading";

export default function Routes() {
  const [activeTags, setActiveTags] = useState({});
  const dataset = (props) => {
    return <Dataset {...props} activeTags={activeTags} />;
  };
  return (
    <App activeTags={activeTags} setActiveTags={setActiveTags}>
      <Switch>
        <Route path={routes.LOADING} exact component={Loading} />
        <Route path={routes.SETUP} exact component={Setup} />
        <Route path={routes.SAMPLES} exact render={dataset} />
        <Route path={routes.FIELDS} exact render={dataset} />
        <Route path={routes.DATASET} render={dataset} />
      </Switch>
    </App>
  );
}
