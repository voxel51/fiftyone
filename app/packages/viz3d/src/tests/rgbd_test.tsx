import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import * as rgbd from "../rgbd_looker"


const Root = React.memo(function (){
    const cfg: Readonly<rgbd.RGBDConfig> = new rgbd.RGBDConfig();
    const sample = new rgbd.RGBDSample();
    sample.filepath = window.location.origin + "/data/desk_1_54.png";
    sample.depth_path = window.location.origin + "/data/desk_1_54_depth.png";
    const l = new rgbd.RGBDLooker(sample, cfg);

    return (
      <div className="content" ref={(el) => {el && l.attach(el)}}/>
    );

})

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <Root />,
    document.getElementById("app")
  )
);