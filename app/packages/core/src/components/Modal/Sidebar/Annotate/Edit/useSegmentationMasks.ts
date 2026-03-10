/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";

export type SegmentationTool = "select" | "brush" | "eraser"; // | "pen";
export type SegmentationToolShape = "circle" | "square";

const DEFAULT_TOOL_SIZE = 10;
const MIN_TOOL_SIZE = 1;
const MAX_TOOL_SIZE = 50;
const TOOL_SIZE_STEP = 2;

// ---------------------------------------------------------------------------
// Atoms (internal)
// ---------------------------------------------------------------------------

const segmentationActiveAtom = atom<boolean>(false);
const toolAtom = atom<SegmentationTool>("select");
const toolSizeAtom = atom<number>(DEFAULT_TOOL_SIZE);
const toolShapeAtom = atom<SegmentationToolShape>("circle");

// ---------------------------------------------------------------------------
// Unsafe exports for non-React bridge access only.
// Do not use directly in React components — use useSegmentationMasks() instead.
// ---------------------------------------------------------------------------

/** @internal */ export { segmentationActiveAtom as _unsafeSegmentationActiveAtom };
/** @internal */ export { toolAtom as _unsafeToolAtom };
/** @internal */ export { toolSizeAtom as _unsafeToolSizeAtom };
/** @internal */ export { toolShapeAtom as _unsafeToolShapeAtom };

/**
 * Segmentation mask tool state hook.
 *
 * Selection/editing state is managed by the existing annotation system
 * (editing atom in state.ts, SelectionManager in Lighter).
 * This hook only owns segmentation-specific tool state.
 */
export const useSegmentationMasks = () => {
  const segmentationActive = useAtomValue(segmentationActiveAtom);
  const tool = useAtomValue(toolAtom);
  const toolSize = useAtomValue(toolSizeAtom);
  const toolShape = useAtomValue(toolShapeAtom);

  const setActive = useSetAtom(segmentationActiveAtom);
  const setTool = useSetAtom(toolAtom);
  const setToolSizeRaw = useSetAtom(toolSizeAtom);
  const setToolShape = useSetAtom(toolShapeAtom);

  const enter = useCallback(() => {
    setActive(true);
  }, [setActive]);

  const exit = useCallback(() => {
    setActive(false);
    setTool("select");
  }, [setActive, setTool]);

  const switchTool = useCallback(
    (newTool: SegmentationTool) => {
      setTool(newTool);
    },
    [setTool]
  );

  const increaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.min(prev + TOOL_SIZE_STEP, MAX_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const decreaseToolSize = useCallback(() => {
    setToolSizeRaw((prev) => Math.max(prev - TOOL_SIZE_STEP, MIN_TOOL_SIZE));
  }, [setToolSizeRaw]);

  const setToolSize = useCallback(
    (size: number) => {
      setToolSizeRaw(Math.max(MIN_TOOL_SIZE, Math.min(size, MAX_TOOL_SIZE)));
    },
    [setToolSizeRaw]
  );

  const switchToolShape = useCallback(
    (shape: SegmentationToolShape) => {
      setToolShape(shape);
    },
    [setToolShape]
  );

  return useMemo(
    () => ({
      active: segmentationActive,
      tool,
      toolSize,
      toolShape,
      enter,
      exit,
      switchTool,
      switchToolShape,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    }),
    [
      segmentationActive,
      tool,
      toolSize,
      toolShape,
      enter,
      exit,
      switchTool,
      switchToolShape,
      increaseToolSize,
      decreaseToolSize,
      setToolSize,
    ]
  );
};
