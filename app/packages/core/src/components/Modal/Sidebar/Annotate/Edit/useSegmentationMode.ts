/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "jotai";

export const DEFAULT_TOOL_SIZE = 16;
export const MIN_TOOL_SIZE = 1;
export const MAX_TOOL_SIZE = 32;
export const MIN_CURSOR_SIZE = 1;
export const MAX_CURSOR_SIZE = 100;

export const SegmentationTool = {
  Select: "select",
  Brush: "brush",
  Pen: "pen",
  AI: "ai",
} as const;
export type SegmentationTool =
  (typeof SegmentationTool)[keyof typeof SegmentationTool];

export const SegmentationToolShape = {
  Circle: "circle",
  Square: "square",
} as const;
export type SegmentationToolShape =
  (typeof SegmentationToolShape)[keyof typeof SegmentationToolShape];

export const SegmentationToolMode = {
  Add: "add",
  Remove: "remove",
} as const;
export type SegmentationToolMode =
  (typeof SegmentationToolMode)[keyof typeof SegmentationToolMode];

export const DEFAULT_TOOL_MODE: SegmentationToolMode = SegmentationToolMode.Add;

export interface SegmentationToolState {
  active: boolean;
  size: number; // World-space dab size (for painting on the mask canvas)
  cursorSize: number; // Screen-pixel cursor size, clamped to [MIN_CURSOR_SIZE, MAX_CURSOR_SIZE]
  tool: SegmentationTool;
  shape: SegmentationToolShape;
  mode: SegmentationToolMode;
}

// ---------------------------------------------------------------------------
// Atoms (internal)
// ---------------------------------------------------------------------------

const segmentationModeActiveAtom = atom<boolean>(false);
const toolAtom = atom<SegmentationTool>(SegmentationTool.Select);
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>(SegmentationToolShape.Circle);
const toolModeAtom = atom<SegmentationToolMode>(DEFAULT_TOOL_MODE);

// ---------------------------------------------------------------------------
// Unsafe exports for non-React bridge access only.
// ---------------------------------------------------------------------------

/** @internal */ export { segmentationModeActiveAtom as _unsafeSegmentationModeActiveAtom };
/** @internal */ export { toolAtom as _unsafeToolAtom };
/** @internal */ export { toolSizeAtom as _unsafeToolSizeAtom };
/** @internal */ export { toolShapeAtom as _unsafeToolShapeAtom };
/** @internal */ export { toolModeAtom as _unsafeToolModeAtom };
