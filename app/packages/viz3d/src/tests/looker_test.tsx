import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import * as three from "three";
import * as draco_loader from "../draco_loader"
import * as pc from "../point_cloud_looker"
import * as pcd from "../point_cloud_display"
import * as thumbs from "../thumbnail_generator"


const Root = React.memo(function (){
    const updater = (sfn) => {
    };
    const dispatcher = (str) => {
    };

    const cfg: Readonly<pc.PointCloudConfig> = new pc.PointCloudConfig();
    const sample = new pc.PointCloudSample();
    sample.filepath = "http://localhost:3001/data/bunny.drc";
    sample.compressed_path = sample.filepath;
    const l = new pc.PointCloudLooker(sample, cfg);

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