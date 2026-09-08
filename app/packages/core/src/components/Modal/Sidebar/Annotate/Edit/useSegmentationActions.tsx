/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { SelectIcon } from "@fiftyone/components";
import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { buildBrushCursor } from "@fiftyone/lighter";
import {
  Add,
  ArrowDropDown,
  ArrowDropUp,
  AutoAwesome,
  Brush,
  CallMerge,
  CircleOutlined,
  Close,
  CropSquare,
  Remove,
  Timeline,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { useAnnotationContext } from "./useAnnotationContext";
import useExit from "./useExit";
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
import type { ToolbarActionGroup } from "@fiftyone/components";
import type { KeyBinding } from "@fiftyone/commands";

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

const SizeValue = styled.button<{ $cursor: string }>`
  text-align: center;
  color: ${({ theme }) => theme.text.primary};
  font-size: 11px;
  padding: 1px 0;
  font-variant-numeric: tabular-nums;
  cursor: ${({ $cursor }) => $cursor};
  border: none;
  background: transparent;
`;

interface BrushSizeProps {
  value: number;
  min: number;
  max: number;
  cursor: string;
  onClick: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
}

const BrushSize = ({
  value,
  min,
  max,
  cursor,
  onClick,
  onIncrease,
  onDecrease,
}: BrushSizeProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const STEP_THRESHOLD = 10;
    let accumulated = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      accumulated += e.deltaY;

      while (accumulated <= -STEP_THRESHOLD) {
        onDecrease();
        accumulated %= STEP_THRESHOLD;
      }

      while (accumulated >= STEP_THRESHOLD) {
        onIncrease();
        accumulated %= STEP_THRESHOLD;
      }
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
      <SizeValue $cursor={cursor} onClick={onClick}>
        {value}
      </SizeValue>
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

export const useSegmentationActions = (): {
  groups: ToolbarActionGroup[];
  visible: boolean;
} => {
  const {
    segmentationModeActive,
    tool,
    toolSize,
    toolShape,
    toolMode,
    setToolSize,
    switchTool,
    switchToolShape,
    switchToolMode,
    increaseToolSize,
    decreaseToolSize,
    deactivateSegmentationMode,
    mergeTool,
  } = useSegmentationMode();

  const { isEditing } = useAnnotationContext();
  const onExit = useExit();

  // Three-tier Escape behaviour, mirroring the right-click flow in
  // InteractionManager:
  //   1. close any open label (clear the editing focus)
  //   2. switch to the Select tool
  //   3. exit segmentation mode entirely
  const handleEscape = useCallback(() => {
    if (isEditing) {
      onExit();
      return;
    }

    if (tool !== SegmentationTool.Select) {
      switchTool(SegmentationTool.Select);
      return;
    }

    deactivateSegmentationMode();
  }, [isEditing, tool, onExit, switchTool, deactivateSegmentationMode]);

  const brushCursor = useMemo(() => {
    const cursorSize = Math.min(
      MAX_CURSOR_SIZE,
      Math.max(MIN_CURSOR_SIZE, toolSize),
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
            shortcut: "V",
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
            shortcut: "D",
            tooltip: "Add to mask",
            isActive: toolMode === SegmentationToolMode.Add,
            onClick: () => switchToolMode(SegmentationToolMode.Add),
          },
          {
            id: SegmentationToolMode.Remove,
            label: "Remove",
            icon: <Remove />,
            shortcut: "E",
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
                onClick={() => {
                  // no value provided falls back to DEFAULT
                  setToolSize();
                }}
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
        id: "close",
        label: "Close",
        actions: [
          {
            id: "close",
            label: "Close",
            icon: <Close />,
            shortcut: "escape",
            tooltip: "Close open label, then tool, then segmentation mode",
            onClick: handleEscape,
          },
        ],
      },
    ],
    [
      brushCursor,
      decreaseToolSize,
      handleEscape,
      increaseToolSize,
      mergeTool.disabled,
      setToolSize,
      switchTool,
      switchToolMode,
      switchToolShape,
      tool,
      toolMode,
      toolShape,
      toolSize,
    ],
  );

  // Wire `shortcut` declarations on toolbar actions into actual keybindings.
  // Each visible, enabled action with a shortcut gets a command in the
  // ModalAnnotate context; `enablement` gates firing on the same conditions
  // the UI uses to enable the button.
  const bindings = useMemo<KeyBinding[]>(() => {
    const out: KeyBinding[] = [];
    for (const group of groups) {
      if (group.isHidden) continue;
      for (const action of group.actions) {
        if (!action.shortcut || !action.onClick) continue;
        out.push({
          commandId: `segmentation-toolbar.${group.id}.${action.id}`,
          sequence: action.shortcut.toLowerCase(),
          handler: () => action.onClick!(),
          label: action.label,
          enablement: () => segmentationModeActive && !action.isDisabled,
        });
      }
    }

    // Brush-only shortcuts that don't bind to a single toolbar button.
    if (tool === SegmentationTool.Brush) {
      out.push({
        commandId: "segmentation-toolbar.size.decrease",
        sequence: "[",
        handler: decreaseToolSize,
        label: "Decrease brush size",
        enablement: () => segmentationModeActive,
      });
      out.push({
        commandId: "segmentation-toolbar.size.increase",
        sequence: "]",
        handler: increaseToolSize,
        label: "Increase brush size",
        enablement: () => segmentationModeActive,
      });
      out.push({
        commandId: "segmentation-toolbar.shape.toggle",
        sequence: "s",
        handler: () =>
          switchToolShape(
            toolShape === SegmentationToolShape.Circle
              ? SegmentationToolShape.Square
              : SegmentationToolShape.Circle,
          ),
        label: "Toggle brush shape",
        enablement: () => segmentationModeActive,
      });
    }

    return out;
  }, [
    decreaseToolSize,
    groups,
    increaseToolSize,
    segmentationModeActive,
    switchToolShape,
    tool,
    toolShape,
  ]);

  useKeyBindings(KnownContexts.ModalAnnotate, bindings, [bindings]);

  return { groups, visible: segmentationModeActive };
};
