import React from "react";

import { Container } from "../utils";
import Indicator from "./Indicator";

export default {
  component: Indicator,
  title: "Flashlight/Scrubber/Indicator",
};

export const indicator = () => (
  <Container>
    <Indicator />
  </Container>
);
