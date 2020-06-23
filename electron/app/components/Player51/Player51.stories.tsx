import React from "react";
import styled from "styled-components";

import Thumbnail from "./Player51";

export default {
  component: Thumbnail,
  title: "Player51/Thumbnail",
};

const Container = styled.div`
  width: 300px;
`;

export const thumbnail = () => (
  <Container>
    <Thumbnail />
  </Container>
);
