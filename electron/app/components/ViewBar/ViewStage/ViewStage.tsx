import React, { useState } from "react";
import styled from "styled-components";
import { useSpring } from "react-spring";

const ViewStage = styled.div`
  width: calc(100% - 2.4rem);
  margin: 1rem;
  height: 3rem;
  line-height: 3rem;
  border-radius: 0.2rem;
  border: 0.2rem solid var(--border);
  background-color: var(--bg);
`;

export default () => {
  return <ViewStage />;
};
