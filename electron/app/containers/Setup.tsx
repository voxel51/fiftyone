import React, { createRef, useState } from "react";
import { Container, Header, Divider, Segment, Menu } from "semantic-ui-react";
import { Redirect } from "react-router-dom";

import routes from "../constants/routes.json";
import connect from "../utils/connect";
import CodeBlock from "../components/CodeBlock";
import PortForm from "../components/PortForm";
import RemoteInstructions from "../components/RemoteInstructions";
import LocalInstructions from "../components/LocalInstructions";

function Setup(props) {
  const { connected, port } = props;
  const [activeTab, setActiveTab] = useState("local");
  if (connected) {
    return <Redirect to={routes.DATASET} />;
  }
  return (
    <Container fluid={true} style={{ padding: "2rem 0" }}>
      <Segment>
        <Header as="h1">Hi there! Welcome to FiftyOne</Header>
        <Divider />
        <p>It looks like you are not connected to a session.</p>
      </Segment>
      <Menu pointing secondary style={{ margin: "2rem 0" }}>
        <Menu.Item
          name="Local sessions"
          active={activeTab === "local"}
          onClick={() => setActiveTab("local")}
        />
        <Menu.Item
          name="Remote sessions"
          active={activeTab === "remote"}
          onClick={() => setActiveTab("remote")}
        />
      </Menu>
      <Segment>
        {activeTab === "remote" ? (
          <RemoteInstructions />
        ) : (
          <LocalInstructions />
        )}
      </Segment>
    </Container>
  );
}

export default connect(Setup);
