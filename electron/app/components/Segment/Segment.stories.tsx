import React from "react";
import styled from "styled-components";

import Segment from "./Segment";
import { Container } from "../utils";

export default {
  component: Segment,
  title: "Segment",
};

export const segment = () => (
  <Container>
    <Segment index={0} />
  </Container>
);
