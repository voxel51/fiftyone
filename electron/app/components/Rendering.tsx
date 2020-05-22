import React, { useState } from "react";
import { Header, Menu } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Labels from "./Labels";
import Tags from "./Tags";

const Rendering = ({ activeTags, setActiveTags }) => (
  <Menu.Item as="h3">
    Display
    <div style={{ paddingTop: "1rem" }}>
      <Header as="h4">Labels</Header>
      <Labels />
      <Header as="h4">Tags</Header>
      <Tags activeTags={activeTags} setActiveTags={setActiveTags} />
    </div>
  </Menu.Item>
);

export default connect(Rendering);
