import React, { MouseEventHandler, ReactNode, useRef } from "react";
import { animated, SpringValue } from "@react-spring/web";
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
  width: 100%;
`;

type RegularEntryProps = {
  backgroundColor?: SpringValue<string>;
  clickable?: boolean;
  children?: ReactNode;
  heading: ReactNode;
  onClick?: MouseEventHandler;
  left?: boolean;
  title: string;
};

const RegularEntry = React.forwardRef(
  (
    {
      backgroundColor,
      children,
      heading,
      onClick,
      title,
      clickable,
      left = false,
    }: RegularEntryProps,
    ref
  ) => {
    const canCommit = useRef(false);

    return (
      <Container
        ref={ref}
        onMouseDown={() => (canCommit.current = true)}
        onMouseMove={() => (canCommit.current = false)}
        onMouseUp={(event) => canCommit.current && onClick && onClick(event)}
        style={{ backgroundColor, cursor: clickable ? "poointer" : "unser" }}
        title={title}
      >
        <Header style={{ justifyContent: left ? "left" : "space-between" }}>
          {heading}
        </Header>
        {children}
      </Container>
    );
  }
);

export default React.memo(RegularEntry);
