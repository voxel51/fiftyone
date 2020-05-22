import React from "react";
import { Menu } from "semantic-ui-react";

export default ({ name, color }) => (
  <div className="tag active" style={{ background: color }}>
    {name}
  </div>
);
