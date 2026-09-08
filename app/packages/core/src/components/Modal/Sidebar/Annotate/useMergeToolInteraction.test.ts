/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleOverlayClick = vi.fn();
const mockClearMergeTarget = vi.fn();
const mockGetOverlay = vi.fn();
const mockExit = vi.fn();

class MockDetectionOverlay {
  constructor(public id: string) {}
}

// captures the handler the hook registers for "lighter:selection-cleared"
let selectionCleared:
  | ((payload: { ignoreSideEffects?: boolean }) => void)
  | null = null;
const mockOn = vi.fn(
  (
    event: string,
    handler: (payload: { ignoreSideEffects?: boolean }) => void,
  ) => {
    if (event === "lighter:selection-cleared") {
      selectionCleared = handler;
    }
  },
);

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: MockDetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  useLighter: () => ({
    scene: {
      getOverlay: (id: string) => mockGetOverlay(id),
      getEventChannel: () => "channel",
    },
  }),
  useLighterEventHandler: () => mockOn,
}));

vi.mock("./Edit/useExit", () => ({ default: () => mockExit }));

vi.mock("./Edit/useMergeTool", () => ({
  useMergeTool: () => ({
    handleOverlayClick: mockHandleOverlayClick,
    clearMergeTarget: mockClearMergeTarget,
  }),
}));

const segmentationModeActiveAtom = atom(false);
const toolAtom = atom<string>("select");

vi.mock("./Edit/useSegmentationMode", () => ({
  SegmentationTool: { Merge: "merge", Select: "select", AI: "ai" },
  _unsafeSegmentationModeActiveAtom: segmentationModeActiveAtom,
  _unsafeToolAtom: toolAtom,
}));

const { useMergeToolInteraction } = await import("./useMergeToolInteraction");

const STORE = getDefaultStore();

const activateMergeTool = () => {
  STORE.set(segmentationModeActiveAtom, true);
  STORE.set(toolAtom, "merge");
};

describe("useMergeToolInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    STORE.set(segmentationModeActiveAtom, false);
    STORE.set(toolAtom, "select");
    selectionCleared = null;
  });

  describe("interceptSelect", () => {
    it("passes through when the merge tool is not active", () => {
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
      expect(mockHandleOverlayClick).not.toHaveBeenCalled();
    });

    it("delegates to the merge tool and consumes when it does (merge/re-click)", () => {
      activateMergeTool();
      mockGetOverlay.mockReturnValue(new MockDetectionOverlay("o1"));
      mockHandleOverlayClick.mockReturnValue(true);
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(true);
      expect(mockHandleOverlayClick).toHaveBeenCalledOnce();
    });

    it("falls through when the merge tool adopts a new target (first click)", () => {
      activateMergeTool();
      mockGetOverlay.mockReturnValue(new MockDetectionOverlay("o1"));
      mockHandleOverlayClick.mockReturnValue(false);
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
    });

    it("passes through a non-detection overlay even while active", () => {
      activateMergeTool();
      mockGetOverlay.mockReturnValue(undefined);
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
      expect(mockHandleOverlayClick).not.toHaveBeenCalled();
    });
  });

  describe("interceptDeselect", () => {
    it("holds the selection (consumes) while active", () => {
      activateMergeTool();
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(true);
    });

    it("passes through when not active", () => {
      const { result } = renderHook(() => useMergeToolInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(false);
    });
  });

  describe("selection-cleared", () => {
    it("drops the merge target and exits when active", () => {
      activateMergeTool();
      renderHook(() => useMergeToolInteraction());

      selectionCleared?.({});

      expect(mockClearMergeTarget).toHaveBeenCalledOnce();
      expect(mockExit).toHaveBeenCalledOnce();
    });

    it("drops the target but does NOT exit on a flagged (side-effect-free) clear", () => {
      activateMergeTool();
      renderHook(() => useMergeToolInteraction());

      selectionCleared?.({ ignoreSideEffects: true });

      expect(mockClearMergeTarget).toHaveBeenCalledOnce();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("ignores the event when the merge tool is not active", () => {
      renderHook(() => useMergeToolInteraction());

      selectionCleared?.({});

      expect(mockClearMergeTarget).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
