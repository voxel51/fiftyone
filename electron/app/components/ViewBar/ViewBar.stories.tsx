import React from "react";
import styled from "styled-components";
import { HotKeys } from "react-hotkeys";

import ViewBar, { viewBarKeyMap } from "./ViewBar";

export default {
  component: ViewBar,
  title: "ViewBar",
};

const Container = styled.div`
  background-color: ${({ theme }) => theme.background};
  padding: 10px;
  width: calc(100% - 20px);
  position: relative;
`;

export const standard = () => (
  <HotKeys keyMap={viewBarKeyMap}>
    <Container>
      <ViewBar />
    </Container>
  </HotKeys>
);
