import {
  Resizable as ReResizable,
  ResizableProps as ReResizableProps,
} from "re-resizable";
import React from "react";
import { useTheme } from "../ThemeProvider";
import { resizeHandle } from "./index.module.css";

/**
 * Currently, only supports resizing left and right
 */
export default function Resizable(props: ResizableProps) {
  const { direction, onResizeStop, onResizeReset, style, ...otherProps } =
    props;
  const resizeRight = direction === "right";
  const resizeLeft = direction === "left";
  const theme = useTheme();

  return (
    <ReResizable
      {...otherProps}
      enable={{
        top: false,
        right: resizeRight,
        bottom: false,
        left: resizeLeft,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, delta) => {
        if (onResizeStop) onResizeStop(e, direction, ref, delta);
        if (e.detail === 2 && onResizeReset) onResizeReset();
      }}
      style={{
        borderLeft: resizeLeft
          ? `1px solid ${theme.primary.plainBorder}`
          : undefined,
        borderRight: resizeRight
          ? `1px solid ${theme.primary.plainBorder}`
          : undefined,
        display: "flex",
        flexDirection: "column",
        ...(style || {}),
      }}
      handleStyles={{
        [direction]: { right: 0, width: 4 },
      }}
      handleClasses={{
        [direction]: resizeHandle,
      }}
    />
  );
}

export type ResizableProps = ReResizableProps & {
  direction?: "left" | "right";
  onResizeReset?: () => void;
};
