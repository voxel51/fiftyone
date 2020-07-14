import React from "react";
import ViewBar from "./ViewBar";

import "../../app.global.css";

export default {
  component: ViewBar,
  title: "ViewBar",
};

export const standard = () => (
  <div
    style={{
      padding: 10,
      width: "calc(100% - 20)",
      position: "relative",
      background: "pink",
    }}
  >
    <ViewBar />
  </div>
);
