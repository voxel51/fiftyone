import React from "react";
import styled from "styled-components";

import Segment from "./Segment";

export default {
  component: Segment,
  title: "Segment",
};

const Container = styled.div`
  width: 100%;
  height: 100px;
`;

export const segment = () => (
  <Container>
    <Segment index={0} />
  </Container>
);
