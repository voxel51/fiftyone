/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type ToolbarActionGroup } from "@fiftyone/components";
import { buildBrushCursor } from "@fiftyone/lighter";
import {
  Add,
  ArrowDropDown,
  ArrowDropUp,
  AutoAwesome,
  Brush,
  CircleOutlined,
  CropSquare,
  FormatColorReset,
  NearMe,
  Redo,
  Remove,
  Timeline,
  Undo,
} from "@mui/icons-material";
import { useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import {
  MAX_CURSOR_SIZE,
  MAX_TOOL_SIZE,
  MIN_CURSOR_SIZE,
  MIN_TOOL_SIZE,
  useSegmentationMode,
} from "./useSegmentationMode";

const SizeControl = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 32px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 3px;
  background: ${({ theme }) => theme.background.level1};
  overflow: hidden;
  user-select: none;
`;

const SizeArrow = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.text.primary};
  cursor: pointer;
  outline: none;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.background.level2};
  }

  &:disabled {
    color: ${({ theme }) => theme.text.tertiary};
    cursor: not-allowed;
  }

  svg {
    font-size: 18px;
  }
`;

const SizeValue = styled.div<{ $cursor: string }>`
  text-align: center;
  color: ${({ theme }) => theme.text.primary};
  font-size: 11px;
  padding: 1px 0;
  font-variant-numeric: tabular-nums;
  cursor: ${({ $cursor }) => $cursor};
`;

interface BrushSizeProps {
  value: number;
  min: number;
  max: number;
  cursor: string;
  onIncrease: () => void;
  onDecrease: () => void;
}

const BrushSize = ({
  value,
  min,
  max,
  cursor,
  onIncrease,
  onDecrease,
}: BrushSizeProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.deltaY < 0) onDecrease();
      else if (e.deltaY > 0) onIncrease();
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onIncrease, onDecrease]);

  return (
    <SizeControl ref={ref}>
      <SizeArrow
        type="button"
        aria-label="Increase brush size"
        onClick={onIncrease}
        disabled={value >= max}
      >
        <ArrowDropUp />
      </SizeArrow>
      <SizeValue $cursor={cursor}>{value}</SizeValue>
      <SizeArrow
        type="button"
        aria-label="Decrease brush size"
        onClick={onDecrease}
        disabled={value <= min}
      >
        <ArrowDropDown />
      </SizeArrow>
    </SizeControl>
  );
};

interface UseSegmentationActionsArgs {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const useSegmentationActions = ({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: UseSegmentationActionsArgs): {
  groups: ToolbarActionGroup[];
  visible: boolean;
} => {
  const {
    segmentationModeActive,
    tool,
    toolSize,
    toolShape,
    toolMode,
    switchTool,
    switchToolShape,
    switchToolMode,
    increaseToolSize,
    decreaseToolSize,
  } = useSegmentationMode();

  const brushCursor = useMemo(() => {
    const cursorSize = Math.min(
      MAX_CURSOR_SIZE,
      Math.max(MIN_CURSOR_SIZE, toolSize)
    );

    return buildBrushCursor({
      active: true,
      tool: "brush",
      shape: toolShape,
      size: toolSize,
      cursorSize,
      mode: toolMode,
    });
  }, [toolShape, toolSize, toolMode]);

  const groups: ToolbarActionGroup[] = useMemo(
    () => [
      {
        id: "tool",
        label: "Tool",
        actions: [
          {
            id: "select",
            label: "Select",
            icon: <NearMe />,
            shortcut: "S",
            tooltip: "Select",
            isActive: tool === "select",
            onClick: () => switchTool("select"),
          },
          {
            id: "brush",
            label: "Brush",
            icon: <Brush />,
            shortcut: "B",
            tooltip: "Brush",
            isActive: tool === "brush",
            onClick: () => switchTool("brush"),
          },
          {
            id: "pen",
            label: "Pen",
            icon: <Timeline />,
            shortcut: "P",
            tooltip: "Pen",
            isActive: tool === "pen",
            onClick: () => switchTool("pen"),
          },
          {
            id: "ai",
            label: "AI",
            icon: <AutoAwesome />,
            shortcut: "A",
            tooltip: "AI",
            isActive: tool === "ai",
            onClick: () => switchTool("ai"),
          },
        ],
      },
      {
        id: "mode",
        label: "Mode",
        isHidden: !["brush", "pen"].includes(tool),
        actions: [
          {
            id: "add",
            label: "Add",
            icon: <Add />,
            tooltip: "Add to mask",
            isActive: toolMode === "add",
            onClick: () => switchToolMode("add"),
          },
          {
            id: "remove",
            label: "Remove",
            icon: <Remove />,
            tooltip: "Remove from mask",
            isActive: toolMode === "remove",
            onClick: () => switchToolMode("remove"),
          },
        ],
      },
      {
        id: "size",
        label: "Size",
        isHidden: tool !== "brush",
        actions: [
          {
            id: "size-input",
            label: "Size",
            icon: <></>,
            onClick: () => {},
            customComponent: (
              <BrushSize
                value={toolSize}
                min={MIN_TOOL_SIZE}
                max={MAX_TOOL_SIZE}
                cursor={brushCursor}
                onIncrease={increaseToolSize}
                onDecrease={decreaseToolSize}
              />
            ),
          },
        ],
      },
      {
        id: "shape",
        label: "Shape",
        isHidden: tool !== "brush",
        actions: [
          {
            id: "circle",
            label: "Circle",
            icon: <CircleOutlined />,
            tooltip: "Circle",
            isActive: toolShape === "circle",
            onClick: () => switchToolShape("circle"),
          },
          {
            id: "square",
            label: "Square",
            icon: <CropSquare />,
            tooltip: "Square",
            isActive: toolShape === "square",
            onClick: () => switchToolShape("square"),
          },
        ],
      },
      {
        id: "actions",
        label: "Actions",
        actions: [
          {
            id: "undo",
            label: "Undo",
            icon: <Undo />,
            shortcut: "Ctrl+Z",
            tooltip: "Undo",
            isDisabled: !canUndo,
            onClick: () => canUndo && onUndo?.(),
          },
          {
            id: "redo",
            label: "Redo",
            icon: <Redo />,
            shortcut: "Ctrl+Shift+Z",
            tooltip: "Redo",
            isDisabled: !canRedo,
            onClick: () => canRedo && onRedo?.(),
          },
          {
            id: "clear",
            label: "Clear mask",
            icon: <FormatColorReset />,
            tooltip: "Clear mask",
            onClick: () => {},
          },
        ],
      },
    ],
    [
      tool,
      toolSize,
      toolShape,
      toolMode,
      switchTool,
      switchToolShape,
      switchToolMode,
      increaseToolSize,
      decreaseToolSize,
      brushCursor,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
    ]
  );

  return { groups, visible: segmentationModeActive };
};
