import React from "react";
import { Menu } from "semantic-ui-react";

export default ({ k, v }) => (
  <Menu.Item as="span">
    {k} &middot; <code>{v}</code>
  </Menu.Item>
);
