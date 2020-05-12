import React, { createRef, useState } from "react";
import { Container, Header, Divider, Segment } from "semantic-ui-react";

import routes from "../constants/routes.json";
import Samples from "../components/Samples";
import Labels from "../components/Labels";
import Search from "../components/Search";
import connect from "../utils/connect";

function Setup(props) {
  return (
    <Container as={Segment} fluid>
      <Header as="h1">Hi there! Welcome to FiftyOne</Header>
      <Divider />
      <Header as="h4">It looks like you are not connected to session.</Header>
    </Container>
  );
}

export default connect(Setup);
