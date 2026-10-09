import * as fos from "@fiftyone/state";
import { cssVar, useDragDelta } from "@voxel51/voodo";
import { type ReactNode, useState } from "react";
import { useReverbState, useResetReverbState } from "@fiftyone/reverb";
import styles from "./InteractiveSidebar/style.module.css";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;
// above the modal's sample tooltip
const MODAL_Z_INDEX = 1501;

const clamp = (width: number) =>
  Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH);

/**
 * The sidebar's resizable column. Dragging its inner edge resizes it, a
 * double click on the edge restores the default width.
 */
const SidebarContainer = ({
  children,
  modal,
}: {
  children: ReactNode;
  modal: boolean;
}) => {
  const [width, setWidth] = useReverbState(fos.sidebarWidth(modal));
  const resetWidth = useResetReverbState(fos.sidebarWidth(modal));
  const [delta, setDelta] = useState(0);
  // the grid's sidebar has its edge on the right, the modal's on the left
  const edge = modal ? "left" : "right";
  const shown = clamp(width + (modal ? -delta : delta));
  const { isDragging, handleProps } = useDragDelta({
    axis: "horizontal",
    onDelta: setDelta,
    onDragEnd: () => {
      setWidth(shown);
      setDelta(0);
    },
  });

  return (
    <div
      data-cy="sidebar"
      style={{
        position: "relative",
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: shown,
        [modal ? "borderLeft" : "borderRight"]:
          `1px solid ${cssVar.color.border.subtle}`,
        borderRadius: modal ? undefined : 8,
        borderTopRightRadius: 8,
        overflow: modal ? undefined : "hidden",
        userSelect: isDragging ? "none" : undefined,
        zIndex: modal ? MODAL_Z_INDEX : undefined,
      }}
    >
      {children}
      <div
        {...handleProps}
        className={styles.resizeHandle}
        onDoubleClick={resetWidth}
        style={{
          position: "absolute",
          top: 0,
          [edge]: 0,
          width: 4,
          height: "100%",
          cursor: "col-resize",
          touchAction: "none",
        }}
      />
    </div>
  );
};

export default SidebarContainer;
