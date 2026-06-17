import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/annotation", () => ({
  useActiveAnnotationSampleId: vi.fn(),
  useAnnotationEngine: vi.fn(),
  useAnnotationEventBus: vi.fn(),
  usePersistAnnotationDeltas: vi.fn(),
}));

import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
  usePersistAnnotationDeltas,
} from "@fiftyone/annotation";
import type { AnnotationLabel } from "@fiftyone/state";
import { useDeleteAnnotation } from "./useDeleteAnnotation";

function makeLabel(
  overrides: Partial<{ labelId: string; labelType: string }> = {}
): AnnotationLabel {
  const labelId = overrides.labelId ?? "label-1";
  const labelType = overrides.labelType ?? "Detection";
  return {
    type: labelType,
    path: "predictions",
    data: { _id: labelId, label: "cat" },
  } as unknown as AnnotationLabel;
}

describe("useDeleteAnnotation", () => {
  let mockPersist: ReturnType<typeof vi.fn>;
  let mockEngineDeleteLabel: ReturnType<typeof vi.fn>;
  let mockEngineTransaction: ReturnType<typeof vi.fn>;
  let mockEngineLastUndoEntry: ReturnType<typeof vi.fn>;
  let mockEngineRollbackEntry: ReturnType<typeof vi.fn>;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersist = vi.fn().mockResolvedValue(true);
    mockEngineDeleteLabel = vi.fn();
    // run the body so the wrapped deleteLabel still executes
    mockEngineTransaction = vi.fn((fn: () => void) => fn());
    // default: no undo entry captured → nothing to roll back
    mockEngineLastUndoEntry = vi.fn().mockReturnValue(undefined);
    mockEngineRollbackEntry = vi.fn();
    mockDispatch = vi.fn();

    vi.mocked(usePersistAnnotationDeltas).mockReturnValue(mockPersist);
    vi.mocked(useAnnotationEngine).mockReturnValue({
      deleteLabel: mockEngineDeleteLabel,
      transaction: mockEngineTransaction,
      lastUndoEntry: mockEngineLastUndoEntry,
      rollbackEntry: mockEngineRollbackEntry,
    } as any);
    vi.mocked(useActiveAnnotationSampleId).mockReturnValue("sample-1");
    vi.mocked(useAnnotationEventBus).mockReturnValue({
      dispatch: mockDispatch,
    } as any);
  });

  function getCallback() {
    return renderHook(() => useDeleteAnnotation()).result.current;
  }

  it("removes the label through the engine and persists immediately", async () => {
    const deleteAnnotation = getCallback();

    await deleteAnnotation(makeLabel({ labelId: "label-42" }));

    expect(mockEngineDeleteLabel).toHaveBeenCalledWith({
      sample: "sample-1",
      path: "predictions",
      instanceId: "label-42",
    });
    expect(mockPersist).toHaveBeenCalledTimes(1);
    // no gesture id → delete is its own undo unit, not wrapped in a keyed tx
    expect(mockEngineTransaction).not.toHaveBeenCalled();
  });

  it("keys the delete with the given gestureId when one is provided (merge)", async () => {
    const deleteAnnotation = getCallback();

    await deleteAnnotation(makeLabel({ labelId: "label-42" }), {
      gestureId: "gesture:1",
    });

    // wrapped in a transaction carrying the gesture id, so the delete
    // coalesces into the gesture's single undo unit
    expect(mockEngineTransaction).toHaveBeenCalledTimes(1);
    expect(mockEngineTransaction.mock.calls[0][1]).toEqual({
      undoKey: "gesture:1",
    });
    expect(mockEngineDeleteLabel).toHaveBeenCalledWith({
      sample: "sample-1",
      path: "predictions",
      instanceId: "label-42",
    });
  });

  it("dispatches deleteSuccess + persistenceSuccess when persistence succeeds", async () => {
    mockPersist.mockResolvedValue(true);
    const deleteAnnotation = getCallback();

    await deleteAnnotation(
      makeLabel({ labelId: "label-42", labelType: "Polyline" })
    );

    expect(mockDispatch).toHaveBeenCalledWith("annotation:persistenceSuccess");
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteSuccess", {
      labelId: "label-42",
      type: "delete",
      labelType: "Polyline",
    });
  });

  it("dispatches deleteError + persistenceError when persistence fails", async () => {
    mockPersist.mockResolvedValue(false);
    const deleteAnnotation = getCallback();

    const result = await deleteAnnotation(makeLabel({ labelId: "label-7" }));

    expect(result).toBe(false);
    expect(mockDispatch).toHaveBeenCalledWith(
      "annotation:persistenceError",
      expect.objectContaining({ error: expect.any(Error) })
    );
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-7",
      type: "delete",
    });
    expect(mockDispatch).not.toHaveBeenCalledWith(
      "annotation:deleteSuccess",
      expect.anything()
    );
  });

  it("treats a null persistence result (no-op) as success", async () => {
    mockPersist.mockResolvedValue(null);
    const deleteAnnotation = getCallback();

    const result = await deleteAnnotation(makeLabel());

    expect(result).toBe(true);
  });

  it("rolls back (restores) the label when the server rejects the delete", async () => {
    // lastUndoEntry: undefined before the delete, the new entry after it
    const entry = { ops: [], undoKey: undefined };
    mockEngineLastUndoEntry
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(entry);
    mockPersist.mockResolvedValue(false);
    const deleteAnnotation = getCallback();

    await deleteAnnotation(makeLabel({ labelId: "label-7" }));

    expect(mockEngineRollbackEntry).toHaveBeenCalledWith(entry);
  });

  it("rolls back the label when persistence throws", async () => {
    const entry = { ops: [], undoKey: undefined };
    mockEngineLastUndoEntry
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(entry);
    mockPersist.mockRejectedValue(new Error("network down"));
    const deleteAnnotation = getCallback();

    await expect(deleteAnnotation(makeLabel())).rejects.toThrow("network down");

    expect(mockEngineRollbackEntry).toHaveBeenCalledWith(entry);
  });

  it("does not roll back a gesture (merge) delete — the gesture owns its rollback", async () => {
    const entry = { ops: [], undoKey: undefined };
    mockEngineLastUndoEntry
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(entry);
    mockPersist.mockResolvedValue(false);
    const deleteAnnotation = getCallback();

    await deleteAnnotation(makeLabel(), { gestureId: "gesture:1" });

    expect(mockEngineRollbackEntry).not.toHaveBeenCalled();
  });

  it("dispatches deleteError and re-throws when persistence throws", async () => {
    const error = new Error("network down");
    mockPersist.mockRejectedValue(error);
    const deleteAnnotation = getCallback();

    await expect(
      deleteAnnotation(makeLabel({ labelId: "label-99" }))
    ).rejects.toThrow("network down");

    expect(mockDispatch).toHaveBeenCalledWith(
      "annotation:persistenceError",
      expect.objectContaining({ error })
    );
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-99",
      type: "delete",
      error,
    });
  });
});
