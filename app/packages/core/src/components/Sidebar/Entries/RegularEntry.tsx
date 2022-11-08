import React, { MouseEventHandler, ReactNode, useRef } from "react";
import { animated, SpringValue } from "@react-spring/web";
import styled from "styled-components";
import Draggable from "./Draggable";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
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
  entryKey?: string;
  color?: string;
  clickable?: boolean;
  heading: ReactNode;
  left?: boolean;
  onClick?: MouseEventHandler;
  onHeaderClick?: MouseEventHandler;
  title: string;
  trigger?: (
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
      onHeaderClick,
      title,
      trigger,
    }: RegularEntryProps,
    ref
  ) => {
    const tolerance = 5;
    const headerClickStart = useRef<MouseEvent>();

    return (
      <Container
        ref={ref}
        onClick={onClick}
        style={{
          backgroundColor,
          cursor: clickable ? "pointer" : "unset",
        }}
        title={title}
      >
        <Draggable color={color} entryKey={entryKey} trigger={trigger}>
          <Header
            onMouseDown={(event: MouseEvent) => {
              headerClickStart.current = event;
            }}
            onMouseUp={(event: MouseEvent) => {
              if (!onHeaderClick) return;
              const startX = headerClickStart?.current?.pageX;
              const startY = headerClickStart?.current?.pageY;
              const endX = event.pageX;
              const endY = event.pageY;
              const deltaX = Math.abs(endX - startX);
              const deltaY = Math.abs(endY - startY);
              if (deltaX <= tolerance && deltaY <= tolerance) {
                onHeaderClick(event);
              }
            }}
            style={{ justifyContent: left ? "left" : "space-between" }}
          >
            {heading}
          </Header>
          {children}
        </Draggable>
      </Container>
    );
  }
);

export default React.memo(RegularEntry);
