import { animated } from "@react-spring/web";
import React from "react";
import styled from "styled-components";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  padding: 3px 3px 3px 8px;
  border-radius: 2px;
  background: ${({ theme }) => theme.background.level1};
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;
  width: 100%;
  flex: 1;
`;

const ObjectItem = () => {
  return (
    <Container>
      <Header>Hi</Header>
    </Container>
  );
};

export default ObjectItem;
