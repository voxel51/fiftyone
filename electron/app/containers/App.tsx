import React, { ReactNode } from "react";
import Nav from "../components/Sidebar";
import { Segment, Sidebar } from "semantic-ui-react";

type Props = {
  children: ReactNode;
};

export default function App(props: Props) {
  const { children } = props;
  return (
    <Sidebar.Pushable>
      <Nav />
      <Sidebar.Pusher>{children}</Sidebar.Pusher>
    </Sidebar.Pushable>
  );
}
