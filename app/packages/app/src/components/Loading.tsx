import React, { MouseEventHandler } from "react";
import styled from "styled-components";
import { useTheme } from "../utils/hooks";

const Container = styled.div`
  display: flex;
  padding: 2rem;
  width: 100%;
  height: 100%;
`;

const Text = styled.div`
  padding-top: 1rem;
  font-weight: bold;
  text-align: center;
  color: ${({ theme }) => theme.fontDark};
  font-size: 1.5rem;

  & a {
    color: ${({ theme }) => theme.brand};
    text-decoration: underline;
    cursor: pointer;
  }
`;

const Loading = React.memo(
  ({
    text = null,
    onClick = null,
  }: {
    text?: string;
    onClick?: MouseEventHandler;
  }) => {
    const theme = useTheme();
    return (
      <Container>
        <div
          style={{
            margin: "auto",
            width: "100%",
            cursor: onClick ? "pointer" : "default",
            color: theme.fontDark,
          }}
          onClick={onClick}
        >
          {text && <Text>{text}</Text>}
        </div>
      </Container>
    );
  }
);

export default Loading;
