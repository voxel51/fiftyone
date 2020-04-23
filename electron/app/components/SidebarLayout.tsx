import React from 'react';
import { Header, Icon, Menu, Segment, Sidebar } from 'semantic-ui-react';

export default function SidebarLayout({ children }) {
  return (
    <Sidebar.Pushable as={Segment}>
      <Sidebar as={Menu} icon="labeled" inverted vertical visible width="thin">
        <Menu.Item as="a">
          <Icon name="camera" />
          Option 1
        </Menu.Item>
        <Menu.Item as="a">
          <Icon name="zoom-in" />
          Option 2
        </Menu.Item>
        <Menu.Item as="a">
          <Icon name="random" />
          Option 3
        </Menu.Item>
      </Sidebar>

      <Sidebar.Pusher>
        <Segment basic>{children}</Segment>
      </Sidebar.Pusher>
    </Sidebar.Pushable>
  );
}
