import React, { useState } from "react";
import { Switch, Route } from "react-router-dom";
import { Dimmer, Loader } from "semantic-ui-react";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";
import Loading from "./containers/Loading";
import randomColor from "randomcolor";
import { getSocket, useSubscribe } from "./utils/socket";
import connect from "./utils/connect";

const colors = randomColor({ count: 100, luminosity: "dark" });

function Routes({ port }) {
  const [activeTags, setActiveTags] = useState({});
  const [activeLabels, setActiveLabels] = useState({});
  const [activeScalars, setActiveScalars] = useState({});
  const [displayData, setDisplayData] = useState({ labels: [], tags: [] });
  const [needsLoad, setNeedsLoad] = useState(true);
  const socket = getSocket(port, "state");
  const appProps = {
    activeTags,
    setActiveTags,
    activeLabels,
    setActiveLabels,
    setActiveScalars,
    activeScalars,
    colors,
    displayData,
  };
  const datasetProps = {
    activeTags,
    activeLabels,
    activeScalars,
  };
  const dataset = (props) => {
    return <Dataset {...props} displayProps={datasetProps} />;
  };
  const loadData = () => {
    setNeedsLoad(false);
    socket.emit("lengths", "", (data) => {
      setDisplayData({
        tags: data.tags,
        labels: data.labels,
      });
    });
  };

  useSubscribe(socket, "update", () => {
    loadData();
  });

  if (needsLoad) {
    loadData();
    return (
      <Dimmer active>
        <Loader>Loading</Loader>
      </Dimmer>
    );
  }
  return (
    <App displayProps={appProps} colors={colors}>
      <Switch>
        <Route path={routes.LOADING} exact component={Loading} />
        <Route path={routes.SETUP} exact component={Setup} />
        <Route path={routes.SAMPLES} exact render={dataset} />
        <Route path={routes.LABELS} exact render={dataset} />
        <Route path={routes.TAGS} exact render={dataset} />
        <Route path={routes.SCALARS} exact render={dataset} />
        <Route path={routes.DATASET} render={dataset} />
      </Switch>
    </App>
  );
}

export default connect(Routes);
