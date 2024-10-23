import * as foa from "@fiftyone/aggregations";
import * as focore from "@fiftyone/core";
import * as foe from "@fiftyone/embeddings";
import * as fol from "@fiftyone/looker";
import * as fom from "@fiftyone/map";
import * as fopb from "@fiftyone/playback";
import * as fosl from "@fiftyone/spotlight";
import * as fof from "@fiftyone/flashlight";
import * as fol3d from "@fiftyone/looker-3d";
import * as foc from "@fiftyone/components";
import * as foo from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import * as fou from "@fiftyone/utilities";
import * as fosp from "@fiftyone/spaces";
import * as fop from "@fiftyone/plugins";
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
    __fosp__: typeof fosp;
    __fop__: typeof fop;
    __foa__: typeof foa;
    __focore__: typeof focore;
    __foe__: typeof foe;
    __fol__: typeof fol;
    __fom__: typeof fom;
    __fopb__: typeof fopb;
    __fosl__: typeof fosl;
    __fof__: typeof fof;
    __fol3d__: typeof fol3d;
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
  window.__fosp__ = fosp;
  window.__mui__ = mui;
  window.__fop__ = fop;
  window.__foa__ = foa;
  window.__focore__ = focore;
  window.__foe__ = foe;
  window.__fol__ = fol;
  window.__fom__ = fom;
  window.__fopb__ = fopb;
  window.__fosl__ = fosl;
  window.__fof__ = fof;
  window.__fol3d__ = fol3d;
  window.__styled__ = styled;
}
