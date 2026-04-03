/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Segmentation-specific toolbar built on the generic FloatingToolbar.
 *
 * This is a thin composition layer — all layout, dragging, and portal logic
 * lives in `@fiftyone/components/FloatingToolbar`.
 */

import { FloatingToolbar, Tooltip } from "@fiftyone/components";
import {
  Brush,
  CircleOutlined,
  CropSquare,
  FormatColorReset,
  Redo,
  Undo,
} from "@mui/icons-material";
import React from "react";
import styled from "styled-components";
import {
  MAX_TOOL_SIZE,
  MIN_TOOL_SIZE,
  useSegmentationMode,
} from "./useSegmentationMode";

// ---------------------------------------------------------------------------
// Local styled helpers (domain-specific, not in FloatingToolbar)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const EraserIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SegmentationToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /**
   * When true (default), the toolbar manages its own SegmentationBrushHandler
   * lifecycle. Set to false when the parent (e.g. InstanceMaskEditor) manages
   * the handler externally.
   */
  standalone?: boolean;
}

export const SegmentationToolbar: React.FC<SegmentationToolbarProps> = ({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const {
    active,
    tool,
    toolSize,
    toolShape,
    switchTool,
    switchToolShape,
    setToolSize,
  } = useSegmentationMode();

  return (
    <FloatingToolbar
      orientation="vertical"
      defaultPosition={{ x: 5, y: 50 }}
      visible={active}
    >
      {/* ---- Tool selection ---- */}
      <FloatingToolbar.Group label="Tool">
        <Tooltip placement="left-center" text="Brush (B)">
          <FloatingToolbar.Action
            active={tool === "brush"}
            onClick={() => switchTool("brush")}
          >
            <Brush />
          </FloatingToolbar.Action>
        </Tooltip>
        <Tooltip placement="left-center" text="Eraser (E)">
          <FloatingToolbar.Action
            active={tool === "eraser"}
            onClick={() => switchTool("eraser")}
          >
            <EraserIcon />
          </FloatingToolbar.Action>
        </Tooltip>
      </FloatingToolbar.Group>

      {/* ---- Brush size ---- */}
      <FloatingToolbar.Group label="Size">
        <SizeInput
          type="number"
          min={MIN_TOOL_SIZE}
          max={MAX_TOOL_SIZE}
          value={toolSize}
          onChange={(e) => setToolSize(Number(e.target.value))}
        />
      </FloatingToolbar.Group>

      {/* ---- Brush shape ---- */}
      <FloatingToolbar.Group label="Shape">
        <Tooltip placement="left-center" text="Circle">
          <FloatingToolbar.Action
            active={toolShape === "circle"}
            onClick={() => switchToolShape("circle")}
          >
            <CircleOutlined />
          </FloatingToolbar.Action>
        </Tooltip>
        <Tooltip placement="left-center" text="Square">
          <FloatingToolbar.Action
            active={toolShape === "square"}
            onClick={() => switchToolShape("square")}
          >
            <CropSquare />
          </FloatingToolbar.Action>
        </Tooltip>
      </FloatingToolbar.Group>

      {/* ---- Actions ---- */}
      <FloatingToolbar.Group label="Actions">
        <Tooltip placement="left-center" text="Undo (Ctrl+Z)">
          <FloatingToolbar.Action
            disabled={!canUndo}
            onClick={canUndo ? onUndo : undefined}
          >
            <Undo />
          </FloatingToolbar.Action>
        </Tooltip>
        <Tooltip placement="left-center" text="Redo (Ctrl+Shift+Z)">
          <FloatingToolbar.Action
            disabled={!canRedo}
            onClick={canRedo ? onRedo : undefined}
          >
            <Redo />
          </FloatingToolbar.Action>
        </Tooltip>
        <Tooltip placement="left-center" text="Clear mask">
          <FloatingToolbar.Action>
            <FormatColorReset />
          </FloatingToolbar.Action>
        </Tooltip>
      </FloatingToolbar.Group>
    </FloatingToolbar>
  );
};
