/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDispatchAnnotationEvent = vi.fn();
const mockExecuteCommand = vi.fn().mockResolvedValue(undefined);
const mockGetLabelById = vi.fn();
const mockAddLabelToSidebar = vi.fn();
const mockRemoveLabelFromSidebar = vi.fn();
const mockRemoveOverlay = vi.fn();
const mockGetOverlay = vi.fn();
const mockAddOverlay = vi.fn();
const mockSelectOverlay = vi.fn();
const mockPushUndoable = vi.fn();
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

class MockDeleteAnnotationCommand {
  constructor(public label: unknown, public schema: unknown) {}
}

class MockMergeDetectionsCommand {
  public id: string;
  constructor(
    public target: unknown,
    public paintData: unknown,
    public deps: {
      deleteSource: () => Promise<void>;
      restoreSource: () => void;
    },
    public targetId: string,
    public sourceId: string
  ) {
    this.id = `merge-${targetId}-${sourceId}-x`;
  }
  execute = vi.fn();
  undo = vi.fn();
}

vi.mock("@fiftyone/annotation", () => ({
  DeleteAnnotationCommand: MockDeleteAnnotationCommand,
  getFieldSchema: (...args: unknown[]) => mockGetFieldSchema(...args),
  useAnnotationEventBus: () => ({ dispatch: mockDispatchAnnotationEvent }),
}));

vi.mock("@fiftyone/command-bus", () => ({
  useCommandBus: () => ({ execute: mockExecuteCommand }),
}));

vi.mock("@fiftyone/commands", () => ({
  CommandContextManager: {
    instance: () => ({
      getActiveContext: () => ({ pushUndoable: mockPushUndoable }),
    }),
  },
}));

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: MockDetectionOverlay,
  MergeDetectionsCommand: MockMergeDetectionsCommand,
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
    expect(mockExecuteCommand).not.toHaveBeenCalled();
    expect(mockPushUndoable).not.toHaveBeenCalled();
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

    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("second click on a different overlay merges, deletes the source, and pushes an undoable", async () => {
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
    expect(target.mergeFrom).toHaveBeenCalledWith(source);
    expect(target.getPaintStrokeData).toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    expect(mockExecuteCommand.mock.calls[0][0]).toBeInstanceOf(
      MockDeleteAnnotationCommand
    );
    expect(mockRemoveLabelFromSidebar).toHaveBeenCalledWith("source");
    expect(mockRemoveOverlay).toHaveBeenCalledWith("source", false);
    expect(mockPushUndoable).toHaveBeenCalledTimes(1);
    expect(mockPushUndoable.mock.calls[0][0]).toBeInstanceOf(
      MockMergeDetectionsCommand
    );
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

    expect(mockExecuteCommand).not.toHaveBeenCalled();
    expect(mockPushUndoable).not.toHaveBeenCalled();
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

  it("MergeDetectionsCommand deps wire deletion and restoration of the source", async () => {
    const target = new MockDetectionOverlay("target");
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

    const command = mockPushUndoable.mock
      .calls[0][0] as MockMergeDetectionsCommand;

    mockExecuteCommand.mockClear();
    mockRemoveLabelFromSidebar.mockClear();
    mockRemoveOverlay.mockClear();

    // Redo path
    await command.deps.deleteSource();
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    expect(mockRemoveLabelFromSidebar).toHaveBeenCalledWith("source");
    expect(mockRemoveOverlay).toHaveBeenCalledWith("source", false);

    // Undo path: re-attach the source overlay and re-add to the sidebar.
    command.deps.restoreSource();
    expect(mockAddOverlay).toHaveBeenCalledWith(source);
    expect(mockAddLabelToSidebar).toHaveBeenCalledWith(sourceLabel);
  });
});
