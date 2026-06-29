/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Real jotai — the hook is a thin atom wrapper. The atoms are module-private
// and persist across renders, so we reset to defaults in afterEach.
import {
  DEFAULT_TOOL_MODE,
  DEFAULT_TOOL_SIZE,
  MAX_TOOL_SIZE,
  MIN_TOOL_SIZE,
  SegmentationTool,
  SegmentationToolMode,
  SegmentationToolShape,
  useManualSegmentationTools,
} from "./useManualSegmentationTools";

const resetTools = (result: {
  current: ReturnType<typeof useManualSegmentationTools>;
}) => {
  act(() => {
    result.current.switchTool(SegmentationTool.Select);
    result.current.switchToolShape(SegmentationToolShape.Circle);
    result.current.switchToolMode(DEFAULT_TOOL_MODE);
    result.current.setToolSize(DEFAULT_TOOL_SIZE);
  });
};

describe("useManualSegmentationTools", () => {
  afterEach(() => {
    const { result } = renderHook(() => useManualSegmentationTools());
    resetTools(result);
  });

  describe("initial state", () => {
    it("defaults: tool=Select, shape=Circle, mode=Add, size=DEFAULT_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      expect(result.current.tool).toBe(SegmentationTool.Select);
      expect(result.current.toolShape).toBe(SegmentationToolShape.Circle);
      expect(result.current.toolMode).toBe(DEFAULT_TOOL_MODE);
      expect(result.current.toolSize).toBe(DEFAULT_TOOL_SIZE);
    });
  });

  describe("switchTool", () => {
    it("transitions through every tool", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      for (const tool of [
        SegmentationTool.Brush,
        SegmentationTool.Pen,
        SegmentationTool.AI,
        SegmentationTool.Merge,
        SegmentationTool.Select,
      ] as const) {
        act(() => result.current.switchTool(tool));
        expect(result.current.tool).toBe(tool);
      }
    });
  });

  describe("switchToolShape / switchToolMode", () => {
    it("switches the shape atom", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.switchToolShape(SegmentationToolShape.Square));
      expect(result.current.toolShape).toBe(SegmentationToolShape.Square);
    });

    it("switches the mode atom (Add → Remove)", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.switchToolMode(SegmentationToolMode.Remove));
      expect(result.current.toolMode).toBe(SegmentationToolMode.Remove);
    });
  });

  describe("tool size clamping", () => {
    it("increaseToolSize clamps to MAX_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      // Start above MAX-1 to verify clamp, not just the increment.
      act(() => result.current.setToolSize(MAX_TOOL_SIZE - 1));
      act(() => result.current.increaseToolSize());
      expect(result.current.toolSize).toBe(MAX_TOOL_SIZE);

      // One more — should stay at MAX.
      act(() => result.current.increaseToolSize());
      expect(result.current.toolSize).toBe(MAX_TOOL_SIZE);
    });

    it("decreaseToolSize clamps to MIN_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize(MIN_TOOL_SIZE + 1));
      act(() => result.current.decreaseToolSize());
      expect(result.current.toolSize).toBe(MIN_TOOL_SIZE);

      act(() => result.current.decreaseToolSize());
      expect(result.current.toolSize).toBe(MIN_TOOL_SIZE);
    });

    it("increaseToolSize then decreaseToolSize round-trips", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      const start = result.current.toolSize;
      act(() => result.current.increaseToolSize());
      expect(result.current.toolSize).toBe(start + 1);
      act(() => result.current.decreaseToolSize());
      expect(result.current.toolSize).toBe(start);
    });

    it("setToolSize clamps inputs above MAX_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize(MAX_TOOL_SIZE + 100));
      expect(result.current.toolSize).toBe(MAX_TOOL_SIZE);
    });

    it("setToolSize clamps inputs below MIN_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize(MIN_TOOL_SIZE - 100));
      expect(result.current.toolSize).toBe(MIN_TOOL_SIZE);
    });

    it("setToolSize ignores NaN (state unchanged)", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize(7));
      expect(result.current.toolSize).toBe(7);
      act(() => result.current.setToolSize(Number.NaN));
      expect(result.current.toolSize).toBe(7);
    });

    it("setToolSize() with no arg resets to DEFAULT_TOOL_SIZE", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize(MAX_TOOL_SIZE));
      expect(result.current.toolSize).toBe(MAX_TOOL_SIZE);
      act(() => result.current.setToolSize());
      expect(result.current.toolSize).toBe(DEFAULT_TOOL_SIZE);
    });

    it("setToolSize coerces numeric strings", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      act(() => result.current.setToolSize("12" as unknown as number));
      expect(result.current.toolSize).toBe(12);
    });
  });

  describe("memoization", () => {
    it("returns a stable object when nothing changes", () => {
      const { result, rerender } = renderHook(() =>
        useManualSegmentationTools(),
      );
      const before = result.current;
      rerender();
      expect(result.current).toBe(before);
    });

    it("returns a new object when state changes", () => {
      const { result } = renderHook(() => useManualSegmentationTools());
      const before = result.current;
      act(() => result.current.switchTool(SegmentationTool.Brush));
      expect(result.current).not.toBe(before);
    });
  });
});
