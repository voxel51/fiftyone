import React, { useState } from "react";
import { Header, Menu } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Labels from "./Labels";
import Tags from "./Tags";

const Rendering = (props) => (
  <Menu.Item as="h3">
    Rendering
    <br />
    <Header as="h4">Labels</Header>
    <br />
    <Labels />
    <br />
    <Header as="h4">Tags</Header>
    <br />
    <Tags />
  </Menu.Item>
);

export default connect(Rendering);
