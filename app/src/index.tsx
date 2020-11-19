import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import HotLoader from "react-hot-loader";
import Root from "./containers/Root";
import "./app.global.css";

const AppContainer = process.env.PLAIN_HMR ? Fragment : HotLoader.AppContainer;

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <AppContainer>
      <Root />
    </AppContainer>,
    document.getElementById("root")
  )
);
