import React from "react";
import styled from "styled-components";

import ViewBar from "./ViewBar";

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

// fix me
const standard = () => {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Container>
        <ViewBar />
      </Container>
    </div>
  );
};
