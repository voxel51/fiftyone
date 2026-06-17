/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDispatchAnnotationEvent = vi.fn();
const mockDeleteAnnotation = vi.fn().mockResolvedValue(true);
const mockGetLabelById = vi.fn();
const mockAddLabelToSidebar = vi.fn();
const mockRemoveLabelFromSidebar = vi.fn();
const mockRemoveOverlay = vi.fn();
const mockGetOverlay = vi.fn();
const mockAddOverlay = vi.fn();
const mockSelectOverlay = vi.fn();
const mockGetFieldSchema = vi
  .fn()
  .mockReturnValue({ ftype: "EmbeddedDocumentField" });

class MockDetectionOverlay {
  public id: string;
  public mergeFrom = vi.fn().mockReturnValue(true);
  public getPaintStrokeData = vi.fn().mockReturnValue({
    beforeSnapshot: { tag: "before" },
    beforeBounds: { x: 0, y: 0, width: 10, height: 10 },
    afterSnapshot: { tag: "after" },
    afterBounds: { x: 0, y: 0, width: 18, height: 18 },
  });
  constructor(id: string) {
    this.id = id;
  }
}

vi.mock("@fiftyone/annotation", () => ({
  getFieldSchema: (...args: unknown[]) => mockGetFieldSchema(...args),
  useAnnotationEventBus: () => ({ dispatch: mockDispatchAnnotationEvent }),
  useAnnotationEngine: () => ({ mintGestureId: () => "gesture:1" }),
  useDeleteAnnotation: () => mockDeleteAnnotation,
}));

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: MockDetectionOverlay,
  useLighter: () => ({
    scene: {
      getOverlay: (id: string) => mockGetOverlay(id),
      addOverlay: mockAddOverlay,
      selectOverlay: mockSelectOverlay,
    },
    removeOverlay: mockRemoveOverlay,
  }),
}));

vi.mock("@fiftyone/state", () => ({
  fieldSchema: () => ({ key: "fieldSchemaKey" }),
  State: { SPACE: { SAMPLE: "sample" } },
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => ({}),
}));

const labelsAtom = atom<Array<{ type: string; data: { mask?: unknown } }>>([
  { type: "Detection", data: { mask: "fake-mask" } },
]);

vi.mock("../useLabels", () => ({
  labels: labelsAtom,
  useLabelsContext: () => ({
    addLabelToSidebar: mockAddLabelToSidebar,
    getLabelById: mockGetLabelById,
    removeLabelFromSidebar: mockRemoveLabelFromSidebar,
  }),
}));

const { useMergeTool, _unsafeMergeTargetIdAtom } = await import(
  "./useMergeTool"
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useMergeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverlay.mockReset();
    mockGetLabelById.mockReset();
    // Reset module-level atoms between tests so prior state doesn't leak.
    getDefaultStore().set(_unsafeMergeTargetIdAtom, null);
    getDefaultStore().set(labelsAtom, [
      { type: "Detection", data: { mask: "fake-mask" } },
    ]);
  });

  it("first click adopts the overlay as the merge target without persisting anything", async () => {
    const { result } = renderHook(() => useMergeTool());

    expect(result.current.mergeTargetId).toBe(null);

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    expect(result.current.mergeTargetId).toBe("ov-1");
    expect(mockDeleteAnnotation).not.toHaveBeenCalled();
  });

  it("re-clicking the same target is a no-op", async () => {
    const { result } = renderHook(() => useMergeTool());

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    expect(mockDeleteAnnotation).not.toHaveBeenCalled();
  });

  it("second click on a different overlay merges, deletes the source, and re-selects the target", async () => {
    const target = new MockDetectionOverlay("target");
    const source = new MockDetectionOverlay("source");
    const sourceLabel = { data: { _id: "source" }, path: "ground_truth" };

    mockGetOverlay.mockImplementation((id: string) =>
      id === "target" ? target : undefined
    );
    mockGetLabelById.mockReturnValue(sourceLabel);

    const { result } = renderHook(() => useMergeTool());

    await act(async () => {
      await result.current.handleOverlayClick(target as never);
    });
    expect(result.current.mergeTargetId).toBe("target");

    await act(async () => {
      await result.current.handleOverlayClick(source as never);
    });

    expect(mockGetOverlay).toHaveBeenCalledWith("target");
    expect(mockGetLabelById).toHaveBeenCalledWith("source");
    // the gesture id tags both the target merge and the source delete, so the
    // whole merge coalesces into one undo unit
    expect(target.mergeFrom).toHaveBeenCalledWith(source, "gesture:1");
    expect(target.getPaintStrokeData).toHaveBeenCalledTimes(1);
    expect(mockDeleteAnnotation).toHaveBeenCalledTimes(1);
    // the gesture id is carried through to the delete so the whole merge
    // coalesces into one undo unit
    expect(mockDeleteAnnotation).toHaveBeenCalledWith(sourceLabel, {
      gestureId: "gesture:1",
    });
    // the engine read-half owns the overlay/row fallout of the delete —
    // no manual scene/sidebar bookkeeping
    expect(mockRemoveLabelFromSidebar).not.toHaveBeenCalled();
    expect(mockRemoveOverlay).not.toHaveBeenCalled();
    // no command-context undoable is pushed — the engine's value-based undo
    // stack owns reverting the merge
    expect(mockSelectOverlay).toHaveBeenCalledWith("target");
    // Target stays as the merge target across a successful merge.
    expect(result.current.mergeTargetId).toBe("target");
  });

  it("aborts the merge when the target overlay's mergeFrom returns false (mask not ready)", async () => {
    const target = new MockDetectionOverlay("target");
    target.mergeFrom = vi.fn().mockReturnValue(false);
    const source = new MockDetectionOverlay("source");
    const sourceLabel = { data: { _id: "source" }, path: "ground_truth" };

    mockGetOverlay.mockReturnValue(target);
    mockGetLabelById.mockReturnValue(sourceLabel);

    const { result } = renderHook(() => useMergeTool());
    await act(async () => {
      await result.current.handleOverlayClick(target as never);
    });
    await act(async () => {
      await result.current.handleOverlayClick(source as never);
    });

    expect(mockDeleteAnnotation).not.toHaveBeenCalled();
    expect(mockRemoveOverlay).not.toHaveBeenCalled();
  });

  it("clearMergeTarget drops the target reference", async () => {
    const { result } = renderHook(() => useMergeTool());

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });
    expect(result.current.mergeTargetId).toBe("ov-1");

    act(() => {
      result.current.clearMergeTarget();
    });

    expect(result.current.mergeTargetId).toBe(null);
  });

  it("disabled is false when at least two mask detections are in the sidebar", () => {
    getDefaultStore().set(labelsAtom, [
      { type: "Detection", data: { mask: "fake-mask-1" } },
      { type: "Detection", data: { mask: "fake-mask-2" } },
    ]);
    const { result } = renderHook(() => useMergeTool());
    expect(result.current.disabled).toBe(false);
  });

  it("disabled is true with only one mask detection (need two to merge)", () => {
    const { result } = renderHook(() => useMergeTool());
    expect(result.current.disabled).toBe(true);
  });

  it("disabled is true when there are no mask detections in the sidebar", () => {
    getDefaultStore().set(labelsAtom, []);
    const { result } = renderHook(() => useMergeTool());
    expect(result.current.disabled).toBe(true);
  });

  it("disabled is true when present detections lack masks", () => {
    getDefaultStore().set(labelsAtom, [
      { type: "Detection", data: {} },
      { type: "Classification" as never, data: {} },
    ]);
    const { result } = renderHook(() => useMergeTool());
    expect(result.current.disabled).toBe(true);
  });

  it("setMergeTarget assigns the merge target id directly", () => {
    const { result } = renderHook(() => useMergeTool());
    expect(result.current.mergeTargetId).toBe(null);

    act(() => {
      result.current.setMergeTarget("ov-9");
    });

    expect(result.current.mergeTargetId).toBe("ov-9");
  });

  it("setMergeTarget(null) clears the target", () => {
    const { result } = renderHook(() => useMergeTool());

    act(() => {
      result.current.setMergeTarget("ov-9");
    });
    expect(result.current.mergeTargetId).toBe("ov-9");

    act(() => {
      result.current.setMergeTarget(null);
    });
    expect(result.current.mergeTargetId).toBe(null);
  });
});
