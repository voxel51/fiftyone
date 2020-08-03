import React from "react";
import ViewBar from "./ViewBar";

import styled from "styled-components";

export default {
  component: ViewBar,
  title: "ViewBar",
};

const Container = styled.div`
  background-color: ${({ theme }) => theme.background};
  padding: 10;
  width: calc(100% - 20);
`;

export const standard = () => (
  <Container>
    <ViewBar />
  </Container>
);
