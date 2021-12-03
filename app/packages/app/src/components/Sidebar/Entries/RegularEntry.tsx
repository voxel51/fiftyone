import React, { MouseEventHandler, ReactNode, useRef } from "react";
import { animated } from "@react-spring/web";
import styled from "styled-components";

const Container = animated(styled.div`
  position: relative;
  overflow: visible;
  justify-content: space-between;
  padding: 3px;
  border-radius: 2px;
  user-select: none;
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;

  & > * {
    margin: 0 6px;
  }
`;

type RegularEntryProps = {
  children?: ReactNode;
  heading: ReactNode;
  onClick?: MouseEventHandler;
  style?: React.CSSProperties;
  title: string;
};

export const RegularEntry = React.memo(
  ({ children, heading, onClick, style, title }: RegularEntryProps) => {
    const canCommit = useRef(false);

    return (
      <Container
        onMouseDown={() => (canCommit.current = true)}
        onMouseMove={() => (canCommit.current = false)}
        onMouseUp={(event) => canCommit.current && onClick && onClick(event)}
        style={style}
        title={title}
      >
        <Header>{heading}</Header>
        {children}
      </Container>
    );
  }
);
