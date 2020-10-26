import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import { AppContainer as ReactHotAppContainer } from "react-hot-loader";
import Root from "./containers/Root";
import "./app.global.css";
import "semantic-ui-less/definitions/collections/grid.less";
import "semantic-ui-less/definitions/collections/menu.less";
import "semantic-ui-less/definitions/modules/dimmer.less";
import "semantic-ui-less/definitions/modules/modal.less";
import "semantic-ui-less/definitions/modules/sidebar.less";
import "semantic-ui-less/definitions/modules/sticky.less";

const AppContainer = process.env.PLAIN_HMR ? Fragment : ReactHotAppContainer;

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <AppContainer>
      <Root />
    </AppContainer>,
    document.getElementById("root")
  )
);
