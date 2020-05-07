import React, { createRef } from "react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import { Container, Menu, Ref, Sticky } from "semantic-ui-react";

import routes from "../constants/routes.json";
import Samples from "../components/Samples";
import Labels from "../components/Labels";
import Search from "../components/Search";
import connect from "../utils/connect";

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const stickyRef = createRef();
  const tabs = ["samples", "labels", "insights"];
  return (
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
            <Samples {...props.socket} />
          </Route>
          <Route path={`${path}labels`}>
            <Labels data={[]} />
          </Route>
          <Route path={`${path}insights`}>Hello</Route>
        </Switch>
      </Container>
    </Ref>
  );
}

export default connect(Dataset);
