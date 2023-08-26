import * as foc from "@fiftyone/components";
import * as foo from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import * as fou from "@fiftyone/utilities";
import * as mui from "@mui/material";
import React from "react";
import ReactDOM from "react-dom";
import * as recoil from "recoil";
import styled from "styled-components";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    recoil: typeof recoil;
    __fos__: typeof fos;
    __foc__: typeof foc;
    __fou__: typeof fou;
    __foo__: typeof foo;
    __mui__: typeof mui;
    __styled__: typeof styled;
  }
}

// required for plugins to use the same instance of React and other dependencies
if (typeof window !== "undefined") {
  // @ts-ignore
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.recoil = recoil;
  window.__fos__ = fos;
  window.__foc__ = foc;
  window.__fou__ = fou;
  window.__foo__ = foo;
  window.__mui__ = mui;
  window.__styled__ = styled;
}
