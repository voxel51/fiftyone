/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useMemo } from "react";
import { atom, useAtom } from "jotai";

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
  Merge: "merge",
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

const toolAtom = atom<SegmentationTool>(SegmentationTool.Select);
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>(SegmentationToolShape.Circle);
const toolModeAtom = atom<SegmentationToolMode>(DEFAULT_TOOL_MODE);

/** @internal */ export { toolAtom as _unsafeToolAtom };
/** @internal */ export { toolSizeAtom as _unsafeToolSizeAtom };
/** @internal */ export { toolShapeAtom as _unsafeToolShapeAtom };
/** @internal */ export { toolModeAtom as _unsafeToolModeAtom };

/**
 * Hook providing the manual (brush/pen/select) segmentation tool state and
 * the actions to mutate it. AI tool behavior lives in `useAIAnnotationMode`.
 */
export const useManualSegmentationTools = () => {
  const [tool, setTool] = useAtom(toolAtom);
  const [toolSize, setToolSizeRaw] = useAtom(toolSizeAtom);
  const [toolShape, setToolShape] = useAtom(toolShapeAtom);
  const [toolMode, setToolMode] = useAtom(toolModeAtom);

  const switchTool = useCallback(
    (newTool: SegmentationTool) => {
      setTool(newTool);
    },
    [setTool],
  );

  const increaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.min(prev + 1, MAX_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const decreaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.max(prev - 1, MIN_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const setToolSize = useCallback(
    (size: number = DEFAULT_TOOL_SIZE) => {
      const n = Number(size);
      if (Number.isNaN(n)) return;
      setToolSizeRaw(Math.max(MIN_TOOL_SIZE, Math.min(n, MAX_TOOL_SIZE)));
    },
    [setToolSizeRaw],
  );

  const switchToolShape = useCallback(
    (shape: SegmentationToolShape) => {
      setToolShape(shape);
    },
    [setToolShape],
  );

  const switchToolMode = useCallback(
    (mode: SegmentationToolMode) => {
      setToolMode(mode);
    },
    [setToolMode],
  );

  return useMemo(
    () => ({
      tool,
      toolSize,
      toolShape,
      toolMode,
      switchTool,
      switchToolShape,
      switchToolMode,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    }),
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
      setToolSize,
    ],
  );
};
