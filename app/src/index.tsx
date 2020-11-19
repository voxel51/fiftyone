import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import { AppContainer as ReactHotAppContainer } from "react-hot-loader";
import Root from "./containers/Root";
import "./app.global.css";

const AppContainer = process.env.PLAIN_HMR ? Fragment : ReactHotAppContainer;

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <AppContainer>
      <Root />
    </AppContainer>,
    document.getElementById("root")
  )
);
