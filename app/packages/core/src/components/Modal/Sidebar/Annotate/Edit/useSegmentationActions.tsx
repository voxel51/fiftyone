/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EraserIcon, type ToolbarActionGroup } from "@fiftyone/components";
import {
  Brush,
  CircleOutlined,
  CropSquare,
  FormatColorReset,
  Redo,
  Timeline,
  Undo,
} from "@mui/icons-material";
import { useMemo } from "react";
import styled from "styled-components";
import {
  MAX_TOOL_SIZE,
  MIN_TOOL_SIZE,
  useSegmentationMode,
} from "./useSegmentationMode";

const SizeInput = styled.input`
  width: 32px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 3px;
  background: ${({ theme }) => theme.background.level1};
  color: ${({ theme }) => theme.text.primary};
  font-size: 11px;
  text-align: center;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.primary.main};
  }

  &::-webkit-inner-spin-button {
    opacity: 1;
  }
`;

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
    switchTool,
    switchToolShape,
    setToolSize,
  } = useSegmentationMode();

  const groups: ToolbarActionGroup[] = useMemo(
    () => [
      {
        id: "tool",
        label: "Tool",
        actions: [
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
            id: "eraser",
            label: "Eraser",
            icon: <EraserIcon />,
            shortcut: "E",
            tooltip: "Eraser",
            isActive: tool === "eraser",
            onClick: () => switchTool("eraser"),
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
        ],
      },
      {
        id: "size",
        label: "Size",
        actions: [
          {
            id: "size-input",
            label: "Size",
            icon: <></>,
            onClick: () => {},
            customComponent: (
              <SizeInput
                type="number"
                min={MIN_TOOL_SIZE}
                max={MAX_TOOL_SIZE}
                value={toolSize}
                onChange={(e) => setToolSize(Number(e.target.value))}
              />
            ),
          },
        ],
      },
      {
        id: "shape",
        label: "Shape",
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
      switchTool,
      switchToolShape,
      setToolSize,
      canUndo,
      canRedo,
      onUndo,
      onRedo,
    ]
  );

  return { groups, visible: segmentationModeActive };
};
