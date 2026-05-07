/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { SelectIcon, type ToolbarActionGroup } from "@fiftyone/components";
import { buildBrushCursor } from "@fiftyone/lighter";
import {
  Add,
  ArrowDropDown,
  ArrowDropUp,
  AutoAwesome,
  Brush,
  CallMerge,
  CircleOutlined,
  CropSquare,
  FormatColorReset,
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
  SegmentationTool,
  SegmentationToolMode,
  SegmentationToolShape,
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
    mergeTool,
  } = useSegmentationMode();

  const brushCursor = useMemo(() => {
    const cursorSize = Math.min(
      MAX_CURSOR_SIZE,
      Math.max(MIN_CURSOR_SIZE, toolSize)
    );

    return buildBrushCursor({
      active: true,
      tool: SegmentationTool.Brush,
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
            id: SegmentationTool.Select,
            label: "Select",
            icon: <SelectIcon />,
            shortcut: "S",
            tooltip: "Select",
            isActive: tool === SegmentationTool.Select,
            onClick: () => switchTool(SegmentationTool.Select),
          },
          {
            id: SegmentationTool.Brush,
            label: "Brush",
            icon: <Brush />,
            shortcut: "B",
            tooltip: "Brush",
            isActive: tool === SegmentationTool.Brush,
            onClick: () => switchTool(SegmentationTool.Brush),
          },
          {
            id: SegmentationTool.Pen,
            label: "Pen",
            icon: <Timeline />,
            shortcut: "P",
            tooltip: "Pen",
            isActive: tool === SegmentationTool.Pen,
            onClick: () => switchTool(SegmentationTool.Pen),
          },
          {
            id: SegmentationTool.AI,
            label: "AI",
            icon: <AutoAwesome />,
            shortcut: "A",
            tooltip: "AI",
            isActive: tool === SegmentationTool.AI,
            onClick: () => switchTool(SegmentationTool.AI),
          },
          {
            id: SegmentationTool.Merge,
            label: "Merge",
            icon: <CallMerge />,
            shortcut: "M",
            tooltip: mergeTool.disabled
              ? "No mask detections to merge"
              : "Merge masks",
            isActive: tool === SegmentationTool.Merge,
            isDisabled: mergeTool.disabled,
            onClick: () =>
              !mergeTool.disabled && switchTool(SegmentationTool.Merge),
          },
        ],
      },
      {
        id: "mode",
        label: "Mode",
        isHidden: !(
          tool === SegmentationTool.Brush || tool === SegmentationTool.Pen
        ),
        actions: [
          {
            id: SegmentationToolMode.Add,
            label: "Add",
            icon: <Add />,
            tooltip: "Add to mask",
            isActive: toolMode === SegmentationToolMode.Add,
            onClick: () => switchToolMode(SegmentationToolMode.Add),
          },
          {
            id: SegmentationToolMode.Remove,
            label: "Remove",
            icon: <Remove />,
            tooltip: "Remove from mask",
            isActive: toolMode === SegmentationToolMode.Remove,
            onClick: () => switchToolMode(SegmentationToolMode.Remove),
          },
        ],
      },
      {
        id: "size",
        label: "Size",
        isHidden: tool !== SegmentationTool.Brush,
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
        isHidden: tool !== SegmentationTool.Brush,
        actions: [
          {
            id: SegmentationToolShape.Circle,
            label: "Circle",
            icon: <CircleOutlined />,
            tooltip: "Circle",
            isActive: toolShape === SegmentationToolShape.Circle,
            onClick: () => switchToolShape(SegmentationToolShape.Circle),
          },
          {
            id: SegmentationToolShape.Square,
            label: "Square",
            icon: <CropSquare />,
            tooltip: "Square",
            isActive: toolShape === SegmentationToolShape.Square,
            onClick: () => switchToolShape(SegmentationToolShape.Square),
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
      mergeTool.disabled,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
    ]
  );

  return { groups, visible: segmentationModeActive };
};
