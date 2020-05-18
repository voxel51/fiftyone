import React, { createRef, useState } from "react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import {
  Image,
  Sidebar,
  Container,
  Menu,
  Ref,
  Sticky,
} from "semantic-ui-react";

import Fields from "../components/Fields";
import Player51 from "../components/Player51";
import Samples from "../components/Samples";
import Search from "../components/Search";
import routes from "../constants/routes.json";
import connect from "../utils/connect";

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const { connected, loading, port } = props;
  const stickyRef = createRef();
  const tabs = ["samples", "fields"];
  const [view, setView] = useState({ visible: false, sample: null });
  let src = null;
  if (view.sample) {
    const path = view.sample.filepath;
    const host = `http://127.0.0.1:${port}/`;
    src = `${host}?path=${path}`;
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
        style={{ zIndex: 10000, width: "50%" }}
        as={Menu}
        animation="overlay"
        direction="right"
        vertical
        visible={view.visible}
        width="very wide"
      >
        {view.sample ? (
          <>
            <Player51
              src={src}
              style={{
                width: "100%",
                position: "relative",
              }}
              sample={view.sample}
            />
            <pre>{JSON.stringify(view.sample, null, 2)}</pre>
          </>
        ) : null}
      </Sidebar>
      <Ref innerRef={stickyRef}>
        <Container fluid={true} style={{ padding: "2rem" }}>
          <Sticky context={stickyRef} style={{ marginTop: "-2rem" }}>
            <Container
              fluid={true}
              style={{ background: "hsl(210, 20%, 15%)", paddingTop: "2rem" }}
            >
              <Search />
              <Menu pointing secondary>
                {tabs.map((v, i) => {
                  return (
                    <Link key={i} to={`${url}${v}`}>
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
            <Route exact path={path}>
              <Redirect to={`${path}samples`} />
            </Route>
            <Route path={`${path}samples`}>
              <Samples {...props.socket} setView={setView} />
            </Route>
            <Route path={`${path}fields`}>
              <Fields data={[]} />
            </Route>
          </Switch>
        </Container>
      </Ref>
    </>
  );
}

export default connect(Dataset);
