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
  text-overflow: ellipses;
  white-space: nowrap;

  & > * {
    margin: 0 6px;
    white-space: nowrap;
    text-overflow: ellipses;
  }
`;

type RegularEntryProps = {
  backgroundColor?: SpringValue<string>;
  clickable?: boolean;
  children?: ReactNode;
  heading: ReactNode;
  onClick?: MouseEventHandler;
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
    }: RegularEntryProps,
    ref
  ) => {
    const canCommit = useRef(false);

    const style = backgroundColor ? { backgroundColor } : {};
    style.cursor = clickable ? "pointer" : "unset";

    return (
      <Container
        ref={ref}
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

export default React.memo(RegularEntry);
