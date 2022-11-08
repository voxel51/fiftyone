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
  onHeaderClick?: MouseEventHandler<HTMLDivElement>;
  title?: string;
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
    const headerRef = useRef();

    return (
      <Container
        ref={ref}
        onClick={onClick}
        style={{
          backgroundColor,
          cursor: clickable ? "pointer" : "unset",
        }}
        title={title}
        onMouseUp={(event) => {
          if (!onHeaderClick) return;
          const validTarget =
            headerRef.current.contains(event.target) ||
            event.target === headerRef.current;
          if (validTarget) {
            onHeaderClick(event);
          }
        }}
      >
        <Draggable
          color={color}
          entryKey={entryKey}
          trigger={trigger}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <Header
            ref={headerRef}
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
