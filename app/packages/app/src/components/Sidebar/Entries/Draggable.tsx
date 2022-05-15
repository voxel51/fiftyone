import { useTheme } from "@fiftyone/components";
import { DragIndicator } from "@material-ui/icons";
import { animated, useSpring } from "@react-spring/web";
import React, { useState } from "react";

const Draggable: React.FC<React.PropsWithChildren<{
  color: string;
  entryKey: string;
  trigger: (
    event: React.MouseEvent<HTMLDivElement>,
    key: string,
    cb: () => void
  ) => void;
}>> = ({ children, color, entryKey, trigger }) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const style = useSpring({
    width: dragging || hovering ? 20 : 5,
    left: dragging || hovering ? -10 : 0,
    cursor: dragging ? "grabbing" : "grab",
  });

  return (
    <>
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
          borderRadius: 2,

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
      <div style={{ width: "100%" }}>{children}</div>
    </>
  );
};

export default Draggable;
