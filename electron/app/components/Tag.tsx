import React from "react";
import { Menu } from "semantic-ui-react";

export default ({ display, name, color }) => (
  <div
    className="tag active"
    style={{ background: color, display: display ? "inline-block" : "none" }}
  >
    {name}
  </div>
);
