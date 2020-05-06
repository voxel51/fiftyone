import React from "react";
import { Switch, Route, Link, Redirect, useRouteMatch } from "react-router-dom";
import { Menu } from "semantic-ui-react";

import routes from "../constants/routes.json";
import SampleList from "../components/SampleList";
import Histogram from "../components/Histogram";
import connect from "../utils/connect";

function Dataset(props) {
  const { path, url } = useRouteMatch();
  console.log(props);
  const tabs = {
    list: "list",
    charts: "charts",
  };
  console.log(path, url);
  return (
    <>
      <Menu pointing secondary>
        {Object.keys(tabs).map((k) => {
          return (
            <Link to={`${url}${tabs[k]}`}>
              <Menu.Item
                key={k}
                name={k}
                active={`/${tabs[k]}` === props.location.pathname}
              />
            </Link>
          );
        })}
      </Menu>
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
    </>
  );
}

export default connect(Dataset);
