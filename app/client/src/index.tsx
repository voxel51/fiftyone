import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import Root from "./containers/Root";

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <Fragment>
      <Root />
    </Fragment>,
    document.getElementById("root")
  )
);
