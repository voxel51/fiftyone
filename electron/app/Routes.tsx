import React, { useState, useEffect } from "react";
import { Switch, Route } from "react-router-dom";

import routes from "./constants/routes.json";
import App from "./containers/App";
import Dataset from "./containers/Dataset";
import Setup from "./containers/Setup";
import Loading from "./containers/Loading";
import randomColor from "randomcolor";
import { createGlobalStyle } from "styled-components";

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
    colors,
    displayData,
  };

  const loadData = () => {
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

  useEffect(loadData, [needsLoad]);

  const FieldStyles = createGlobalStyle`${displayData.labels
    .map(
      (f, i) =>
        `.sample-field-${f.field} {
        background: ${colors[f.color]};
      }

      .active-field-${f.field} .sample-field-${f.field} {
        display: inline-block;
      }
      `
    )
    .join(" ")}`;

  const activeLabelClasses = Object.keys(activeLabels).map(
    (l, i) => `active-field-${l}`
  );
  const classes = ["asfgsfg", ...activeLabelClasses].join(" ");

  const dataset = (props) => {
    return <Dataset {...props} displayProps={datasetProps} classes={classes} />;
  };

  return (
    <App displayProps={appProps} colors={colors}>
      <FieldStyles />
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
