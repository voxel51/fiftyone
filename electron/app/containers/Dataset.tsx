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

import routes from "../constants/routes.json";
import Samples from "../components/Samples";
import Labels from "../components/Labels";
import Search from "../components/Search";
import connect from "../utils/connect";

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const stickyRef = createRef();
  const tabs = ["samples", "labels", "insights"];
  const [view, setView] = useState({ visible: false, sample: null });
  console.log(view);
  let src = null;
  if (view.sample) {
    const path = view.sample.filepath;
    const host = "http://127.0.0.1:5151/";
    const mimeType = view.sample.metadata.mime_type;
    src = `${host}?path=${path}&mime_type=${mimeType}`;
  }

  return (
    <Sidebar.Pushable raised>
      <Sidebar
        target={stickyRef}
        onHide={() => setView({ visible: false, sample: null })}
        style={{ background: "black" }}
        as={Menu}
        animation="overlay"
        direction="right"
        vertical
        visible={view.visible}
        width="very wide"
      >
        {view.sample ? (
          <>
            <Image style={{ width: "100%" }} src={src} />
            <pre style={{ color: "white" }}>
              {JSON.stringify(view.sample, null, 2)}
            </pre>
          </>
        ) : null}
      </Sidebar>
      <Ref innerRef={stickyRef}>
        <Container fluid={true} style={{ padding: "0 2rem" }}>
          <Sticky context={stickyRef}>
            <Container
              fluid={true}
              style={{ background: "white", paddingTop: "2rem" }}
            >
              <Search />
              <Menu pointing secondary>
                {tabs.map((v) => {
                  return (
                    <Link to={`${url}${v}`}>
                      <Menu.Item
                        key={v}
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
            <Route path={`${path}labels`}>
              <Labels data={[]} />
            </Route>
            <Route path={`${path}insights`}>Hello</Route>
          </Switch>
        </Container>
      </Ref>
    </Sidebar.Pushable>
  );
}

export default connect(Dataset);
