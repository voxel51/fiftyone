import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { DragIndicator } from "@mui/icons-material";
import { animated, useSpring } from "@react-spring/web";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";

const Draggable: React.FC<
  React.PropsWithChildren<{
    color?: string;
    entryKey: string;
    trigger?: (
      event: React.MouseEvent<HTMLDivElement>,
      key: string,
      cb: () => void
    ) => void;
  }>
> = ({ children, color, entryKey, trigger }) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const canModifySidebarGroup = useRecoilValue(fos.canModifySidebarGroup);
  const isReadOnly = canModifySidebarGroup.enabled !== true;
  const isFieldVisibilityApplied = useRecoilValue(fos.isFieldVisibilityActive);

  const disableDrag =
    !entryKey ||
    entryKey.split(",")[1]?.includes("tags") ||
    entryKey.split(",")[1]?.includes("_label_tags") ||
    isReadOnly ||
    isFieldVisibilityApplied;
  const active = trigger && (dragging || hovering) && !disableDrag;

  const style = useSpring({
    width: active ? 20 : 5,
    left: active ? -10 : 0,
    cursor: disableDrag
      ? "default"
      : entryKey && trigger
      ? dragging
        ? "grabbing"
        : "grab"
      : "pointer",
  });
  const dataCyKey = entryKey
    ?.split(",")?.[1]
    ?.replace(/["]/g, "")
    ?.replace("]", "");

  const isDraggable = useMemo(
    () => !disableDrag && trigger && !isReadOnly,
    [disableDrag, trigger, isReadOnly]
  );

  return (
    <>
      <animated.div
        data-draggable={isDraggable}
        data-cy={`sidebar-entry-draggable-${dataCyKey}`}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={
          isDraggable
            ? (event) => {
                setDragging(true);
                trigger(event, entryKey, () => setDragging(false));
              }
            : undefined
        }
        onMouseEnter={
          isReadOnly ? undefined : () => trigger && setHovering(true)
        }
        onMouseLeave={isReadOnly ? undefined : () => setHovering(false)}
        style={{
          backgroundColor: color,
          position: "absolute",
          top: 0,
          zIndex: active ? 100 : 0,
          borderRadius: 2,

          height: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: `0 2px 20px ${theme.custom.shadow}`,
          overflow: "hidden",
          ...style,
          ...(isReadOnly ? { cursor: "not-allowed" } : {}),
        }}
        title={
          isReadOnly
            ? "Can not reorder in read-only mode" +
              canModifySidebarGroup.message
              ? ": " + canModifySidebarGroup.message
              : ""
            : trigger
            ? "Drag to reorder"
            : undefined
        }
      >
        {active && <DragIndicator style={{ color: theme.background.level1 }} />}
      </animated.div>
      <div style={{ width: "100%" }}>{children}</div>
    </>
  );
};

export default Draggable;
