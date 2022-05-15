import React, { MouseEventHandler, ReactNode, useRef, useState } from "react";
import { animated, SpringValue, useSpring } from "@react-spring/web";
import styled from "styled-components";
import { useTheme } from "@fiftyone/components";
import { DragIndicator } from "@material-ui/icons";

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

const Wrapper = styled.div`
  width: 100%;
`;

const Drag: React.FC<{
  color: string;
  entryKey: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}> = ({ color, entryKey, trigger }) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const style = useSpring({
    width: dragging || hovering ? 20 : 5,
    cursor: dragging ? "grabbing" : "grab",
  });

  return (
    <animated.div
      onMouseDown={(event) => {
        setDragging(true);
        trigger(event, entryKey, () => setDragging(false));
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        backgroundColor: color,
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 1,
        borderTopLeftRadius: 2,
        borderBottomLeftRadius: 2,
        height: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: `0 2px 20px ${theme.backgroundDark}`,
        ...style,
      }}
      title={"Drag to reorder"}
    >
      {(dragging || hovering) && (
        <DragIndicator style={{ color: theme.backgroundLight }} />
      )}
    </animated.div>
  );
};

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
        <Drag color={color} entryKey={entryKey} trigger={trigger} />
        <Wrapper>
          <Header style={{ justifyContent: left ? "left" : "space-between" }}>
            {heading}
          </Header>
          {children}
        </Wrapper>
      </Container>
    );
  }
);

export default React.memo(RegularEntry);
