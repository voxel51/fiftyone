import { useTheme } from "@fiftyone/components";
import React, { MouseEventHandler } from "react";
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
`;

const Text = styled.div`
  padding-top: 1rem;
  font-weight: bold;
  text-align: center;
  color: ${({ theme }) => theme.text.secondary};
  font-size: 1.5rem;

  & a {
    color: ${({ theme }) => theme.primary.plainColor};
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
            color: theme.text.secondary,
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
