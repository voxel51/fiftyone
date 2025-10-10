import { LoadingDots, useTheme } from "@fiftyone/components";
import { animated } from "@react-spring/web";
import React from "react";
import styled from "styled-components";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: 2px;
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;
  width: 100%;
  flex: 1;
  justify-content: space-between;
`;

const LoadingEntry = () => {
  const theme = useTheme();
  return (
    <Container>
      <Header>
        <LoadingDots
          text={"Loading"}
          style={{
            color: theme.text.secondary,
          }}
        />
      </Header>
    </Container>
  );
};

export default LoadingEntry;
