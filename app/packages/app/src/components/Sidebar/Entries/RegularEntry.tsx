import React, { MouseEventHandler, ReactNode, useRef } from "react";
import { animated, SpringValue } from "@react-spring/web";
import styled from "styled-components";
import Draggable from "./Draggable";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  overflow: visible;
  padding: 3px 3px 3px 8px;
  border-radius: 2px;
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;
  width: 100%;
  cursor: pointer;
  flex: 1;
`;

type RegularEntryProps = React.PropsWithChildren<{
  backgroundColor?: SpringValue<string>;
  entryKey: string;
  color?: string;
  clickable?: boolean;
  heading: ReactNode;
  left?: boolean;
  onClick?: MouseEventHandler;
  title: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}>;

const RegularEntry = React.forwardRef(
  (
    {
      backgroundColor,
      children,
      clickable,
      color,
      entryKey,
      heading,
      left = false,
      onClick,
      title,
      trigger,
    }: RegularEntryProps,
    ref
  ) => {
    const canCommit = useRef(false);

    return (
      <Container
        ref={ref}
        onMouseDown={() => {
          canCommit.current = true;
        }}
        onMouseMove={() => {
          canCommit.current && (canCommit.current = false);
        }}
        onMouseUp={(event) => {
          canCommit.current && onClick && onClick(event);
        }}
        style={{
          backgroundColor,
          cursor: clickable ? "pointer" : "unset",
        }}
        title={title}
      >
        <Draggable color={color} entryKey={entryKey} trigger={trigger}>
          <Header style={{ justifyContent: left ? "left" : "space-between" }}>
            {heading}
          </Header>
          {children}
        </Draggable>
      </Container>
    );
  }
);

export default React.memo(RegularEntry);
