import React, { useState } from "react";
import { Switch, Route } from "react-router-dom";
import { Dimmer, Loader } from "semantic-ui-react";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";
import Loading from "./containers/Loading";
import randomColor from "randomcolor";
import { getSocket } from "./utils/socket";
import connect from "./utils/connect";

const colors = randomColor({ count: 100, luminosity: "dark" });

function Routes({ port }) {
  const [activeTags, setActiveTags] = useState({});
  const [activeLabels, setActiveLabels] = useState({});
  const [activeOther, setActiveOther] = useState({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [lengths, setLengths] = useState({});
  const [colorMap, setColorMap] = useState({});
  const socket = getSocket(port, "state");

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

  if (initialLoad) {
    socket.emit("lengths", "", (data) => {
      console.log(data);
      const mapping = {};
      const labelKeys = Object.keys(data.labels);
      let clen = 0;
      for (const i in data.labels) {
        if (data.labels[i]._id.cls !== "Classification") continue;
        clen += 1;
        mapping[data.labels[i]._id.field] = i;
      }
      for (const i in data.tags) {
        mapping[data.tags[i]] = clen + i;
      }
      let olen = 0;
      for (const i in data.labels) {
        if (data.labels[i]._id.cls === "Classification") continue;
        mapping[data.labels[i]._id.field] = clen + olen + data.tags.length;
        olen += 1;
      }
      console.log(mapping);
      setLengths({
        tags: data.tags.length,
        labels: data.labels.length,
        mapping: mapping,
      });
      setInitialLoad(false);
    });
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
