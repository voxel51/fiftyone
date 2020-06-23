import React from "react";
import styled from "styled-components";

import Section from "./Section";

export default {
  component: Section,
  title: "Section",
};

const Container = styled.div`
  width: 100%;
`;

export const section = () => (
  <Container>
    <Section />
  </Container>
);
