import React from "react";
import styled from "styled-components";

import Section from "./Flashlight";
import Flashlight from "./Flashlight";

export default {
  component: Flashlight,
  title: "Flashlight",
};

const Container = styled.div`
  width: 100%;
`;

export const flashlight = () => (
  <Container>
    <Flashlight />
  </Container>
);
