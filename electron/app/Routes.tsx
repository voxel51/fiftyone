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
  const [activeOther, setActiveOther] = useState({});
  const [lengths, setLengths] = useState({});
  const [needsLoad, setNeedsLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [colorMap, setColorMap] = useState({});
  const socket = getSocket(port, "state");
  console.log(colors);
  const appProps = {
    activeTags,
    setActiveTags,
    activeLabels,
    setActiveLabels,
    setActiveOther,
    activeOther,
    colors,
    lengths,
  };
  const datasetProps = {
    activeTags,
    activeLabels,
    activeOther,
    colors,
    lengths,
  };
  const dataset = (props) => {
    return <Dataset {...props} displayProps={datasetProps} />;
  };
  const loadData = () => {
    setNeedsLoad(false);
    setLoading(true);
    socket.emit("lengths", "", (data) => {
      const mapping = {};
      const labelKeys = data.labels ? Object.keys(data.labels).sort() : [];
      let clen = 0;
      for (const i in labelKeys) {
        mapping[data.labels[labelKeys[i]]._id.field] = i;
      }
      for (const i in data.tags) {
        mapping[data.tags[i]] = data.labels.length + i;
      }
      setLengths({
        tags: data.tags,
        labels: data.labels,
        mapping: mapping,
      });
      setLoading(false);
    });
  };

  useSubscribe(socket, "update", () => {
    setLoading(true);
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
        <Route path={routes.FIELDS} exact render={dataset} />
        <Route path={routes.DATASET} render={dataset} />
      </Switch>
    </App>
  );
}

export default connect(Routes);
