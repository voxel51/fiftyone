import React from "react";
import styled from "styled-components";

import Thumbnail from "./Player51";
import { Container } from "../utils";

export default {
  component: Thumbnail,
  title: "Player51/Thumbnail",
};

export const thumbnail = () => (
  <Container>
    <Thumbnail index={0} />
  </Container>
);
