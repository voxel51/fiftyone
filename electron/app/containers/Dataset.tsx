import React, { createRef, useState } from "react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import {
  Sidebar,
  Container,
  Menu,
  Ref,
  Sticky,
  Message,
  Segment,
} from "semantic-ui-react";

import Distributions from "../components/Distributions";
import InfoItem from "../components/InfoItem";
import Player51 from "../components/Player51";
import Samples from "../components/Samples";
import routes from "../constants/routes.json";
import connect from "../utils/connect";

function NoDataset() {
  return (
    <Segment>
      <Message>No dataset loaded</Message>
    </Segment>
  );
}

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const { connected, loading, port, state, displayProps, classes } = props;
  const hasDataset = Boolean(state && state.dataset);
  const stickyRef = createRef();
  const tabs = [routes.SAMPLES, routes.LABELS, routes.TAGS, routes.SCALARS];
  const [view, setView] = useState({ visible: false, sample: null });
  let src = null;
  let s = null;
  if (view.sample) {
    const path = view.sample.filepath;
    const id = view.sample._id.$oid;
    const host = `http://127.0.0.1:${port}/`;
    src = `${host}?path=${path}&id=${id}`;
    s = view.sample;
  }
  if (loading) {
    return <Redirect to={routes.LOADING} />;
  }

  if (!connected) {
    return <Redirect to={routes.SETUP} />;
  }

  return (
    <>
      <Sidebar
        target={stickyRef}
        onHide={() => setView({ visible: false, sample: null })}
        style={{ zIndex: 100001, width: "50%", padding: 0 }}
        as={Menu}
        animation="overlay"
        direction="right"
        vertical
        visible={view.visible}
      >
        {s ? (
          <>
            <Player51
              src={src}
              style={{
                width: "100%",
                position: "relative",
              }}
              sample={view.sample}
              colors={displayProps.colors}
              activeLabels={displayProps.activeLabels}
            />
            <InfoItem k="id" v={s._id.$oid} />
            <InfoItem k="filepath" v={s.filepath} />
            <InfoItem k="tags" v={JSON.stringify(s.tags, 2)} />
            <InfoItem k="metadata" v={JSON.stringify(s.metadata, 2)} />
            {Object.keys(s).map((k, i) => {
              if (s[k] && s[k]._cls === "Classification") {
                return (
                  <>
                    <InfoItem key={i} k={k} v={s[k].label} />
                    <pre style={{ padding: "1rem" }}>
                      {JSON.stringify(s[k], null, 2)}
                    </pre>
                  </>
                );
              } else if (s[k] && s[k]._cls === "Detections") {
                const l = s[k].detections.length;
                return (
                  <>
                    <InfoItem
                      key={i}
                      k={k}
                      v={`${l} detection${l === 1 ? "" : "s"}`}
                    />
                    <pre style={{ padding: "1rem" }}>
                      {JSON.stringify(s[k], null, 2)}
                    </pre>
                  </>
                );
              }
            })}
          </>
        ) : null}
      </Sidebar>
      <Container
        fluid={true}
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateRows: "42px 1fr",
        }}
      >
        <Menu pointing secondary>
          {tabs.map((v, i) => {
            return (
              <Link key={i} to={v}>
                <Menu.Item
                  name={v.slice(1)}
                  active={v === props.location.pathname}
                />
              </Link>
            );
          })}
        </Menu>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <Switch>
            <Route exact path={routes.DATASET}>
              <Redirect to={routes.SAMPLES} />
            </Route>
            {hasDataset ? (
              <>
                <Route path={routes.SAMPLES}>
                  <Samples
                    {...props.socket}
                    setView={setView}
                    displayProps={displayProps}
                    classes={classes}
                  />
                </Route>
                <Route path={routes.LABELS}>
                  <Distributions group="labels" />
                </Route>
                <Route path={routes.TAGS}>
                  <Distributions group="tags" />
                </Route>
                <Route path={routes.SCALARS}>
                  <Distributions group="scalars" />
                </Route>
              </>
            ) : (
              <NoDataset />
            )}
          </Switch>
        </div>
      </Container>
    </>
  );
}

export default connect(Dataset);
