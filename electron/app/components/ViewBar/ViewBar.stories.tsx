import React from "react";
import ViewBar from "./ViewBar";

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
