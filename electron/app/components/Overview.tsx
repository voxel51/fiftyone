import React, { useState } from "react";
import { Header, Icon, Menu, Segment, Sidebar } from "semantic-ui-react";
import SidebarLayout from "./SidebarLayout";

export default function Overview() {
  const [tab, setTab] = useState("overview");

  return (
    <Segment>
      <Header as="h3">Overview: [name]</Header>

      <Menu pointing secondary>
        {["overview", "pools", "side-by-side", "overlayed"].map((item) => (
          <Menu.Item
            key={item}
            name={item}
            active={tab === item}
            onClick={() => setTab(item)}
          />
        ))}
      </Menu>
    </Segment>
  );
}
