import React from "react";
import ViewBar from "../ViewBar";
import ViewStage from "./ViewStage";

import "../../../app.global.css";

export default {
  component: ViewStage,
  title: "ViewBar/ViewStage",
};

export const standard = () => (
  <ViewBar>
    <ViewStage />
  </ViewBar>
);
