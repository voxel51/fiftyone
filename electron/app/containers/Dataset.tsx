import React, { createRef } from "react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import { Container, Menu, Ref, Sticky } from "semantic-ui-react";

import routes from "../constants/routes.json";
import SampleList from "../components/SampleList";
import Histogram from "../components/Histogram";
import FacetBuilder from "../components/FacetBuilder";
import connect from "../utils/connect";

function Dataset(props) {
  const { path, url } = useRouteMatch();
  const stickyRef = createRef();
  const tabs = {
    list: "samples",
    charts: "classes",
  };
  return (
    <Ref innerRef={stickyRef}>
      <Container fluid={true} style={{ padding: "2rem" }}>
        <Sticky context={stickyRef}>
          <FacetBuilder />
          <Menu pointing secondary style={{ background: "white" }}>
            {Object.keys(tabs).map((k) => {
              return (
                <Link to={`${url}${k}`}>
                  <Menu.Item
                    key={k}
                    name={tabs[k]}
                    active={`/${k}` === props.location.pathname}
                  />
                </Link>
              );
            })}
          </Menu>
        </Sticky>
        <Switch>
          <Route exact path={path}>
            <Redirect to={`${path}list`} />
          </Route>
          <Route path={`${path}list`}>
            <SampleList {...props.socket} />
          </Route>
          <Route path={`${path}charts`}>
            <Histogram data={[]} />
          </Route>
        </Switch>
      </Container>
    </Ref>
  );
}

export default connect(Dataset);
