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

import Fields from "../components/Fields";
import InfoItem from "../components/InfoItem";
import Player51 from "../components/Player51";
import Samples from "../components/Samples";
import Search from "../components/Search";
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
  const { connected, loading, port, state, displayProps } = props;
  const hasDataset = Boolean(state && state.dataset);
  const stickyRef = createRef();
  const tabs = ["samples", "fields"];
  const [view, setView] = useState({ visible: false, sample: null });
  let src = null;
  let s = null;
  if (view.sample) {
    const path = view.sample.filepath;
    const host = `http://127.0.0.1:${port}/`;
    src = `${host}?path=${path}`;
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
        style={{ zIndex: 100001, width: "50%" }}
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
      <Ref innerRef={stickyRef}>
        <Container fluid={true} style={{ padding: "2rem 2rem 2rem" }}>
          <Sticky context={stickyRef}>
            <Container
              fluid={true}
              style={{
                background: "hsl(210, 20%, 15%)",
                paddingTop: "2rem",
                zIndex: 1000000,
                display: "none",
              }}
            >
              <Menu pointing secondary>
                {tabs.map((v, i) => {
                  return (
                    <Link key={i} to={`${routes.DATASET}${v}`}>
                      <Menu.Item
                        name={v}
                        active={`/${v}` === props.location.pathname}
                      />
                    </Link>
                  );
                })}
              </Menu>
            </Container>
          </Sticky>
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
                  />
                </Route>
                <Route path={routes.FIELDS}>
                  <Fields data={[]} />
                </Route>
              </>
            ) : (
              <NoDataset />
            )}
          </Switch>
        </Container>
      </Ref>
    </>
  );
}

export default connect(Dataset);
