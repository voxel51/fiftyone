import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import Root from "./containers/Root";
import "./app.global.css";

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <Fragment>
      <Root />
    </Fragment>,
    document.getElementById("root")
  )
);
