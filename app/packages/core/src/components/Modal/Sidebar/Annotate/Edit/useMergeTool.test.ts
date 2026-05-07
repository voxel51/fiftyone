/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
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
const mockGetFieldSchema = vi.fn().mockReturnValue({ ftype: "EmbeddedDocumentField" });

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
    public deps: { deleteSource: () => Promise<void>; restoreSource: () => void },
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

vi.mock("../useLabels", () => ({
  useLabelsContext: () => ({
    addLabelToSidebar: mockAddLabelToSidebar,
    getLabelById: mockGetLabelById,
    removeLabelFromSidebar: mockRemoveLabelFromSidebar,
  }),
}));

const { useMergeTool, _unsafeMergeTargetIdAtom } = await import("./useMergeTool");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useMergeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverlay.mockReset();
    mockGetLabelById.mockReset();
    // Reset module-level atom between tests so prior state doesn't leak.
    getDefaultStore().set(_unsafeMergeTargetIdAtom, null);
  });

  it("first click adopts the overlay as the merge target and dispatches the establish event", async () => {
    const { result } = renderHook(() => useMergeTool());

    expect(result.current.mergeTargetId).toBe(null);

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    expect(result.current.mergeTargetId).toBe("ov-1");
    expect(mockDispatchAnnotationEvent).toHaveBeenCalledWith(
      "annotation:canvasDetectionOverlayEstablish",
      { id: "ov-1", overlay }
    );
    expect(mockExecuteCommand).not.toHaveBeenCalled();
    expect(mockPushUndoable).not.toHaveBeenCalled();
  });

  it("re-clicking the same target is a no-op", async () => {
    const { result } = renderHook(() => useMergeTool());

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    mockDispatchAnnotationEvent.mockClear();

    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    expect(mockDispatchAnnotationEvent).not.toHaveBeenCalled();
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

  it("deactivate clears the merge target", async () => {
    const { result } = renderHook(() => useMergeTool());

    const overlay = new MockDetectionOverlay("ov-1");
    await act(async () => {
      await result.current.handleOverlayClick(overlay as never);
    });

    act(() => {
      result.current.deactivate();
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

    // Undo path
    command.deps.restoreSource();
    expect(mockAddOverlay).toHaveBeenCalledWith(source);
    expect(mockAddLabelToSidebar).toHaveBeenCalledWith(sourceLabel);
  });
});
