import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@fiftyone/annotation", () => ({
  useActiveAnnotationSampleId: vi.fn(),
  useAnnotationEngine: vi.fn(),
  useAnnotationEventBus: vi.fn(),
  useDeleteLabel: vi.fn(),
  usePersistAnnotationDeltas: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: { key: "isGeneratedView" },
}));

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn(),
}));

vi.mock("@fiftyone/command-bus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/command-bus")>();
  return {
    ...actual,
    useRegisterCommandHandler: vi.fn(),
  };
});

import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
  useDeleteLabel,
  usePersistAnnotationDeltas,
} from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useRecoilValue } from "recoil";
import { useRegisterAnnotationCommandHandlers } from "./useRegisterAnnotationCommandHandlers";
import type { LabelProxy } from "../deltas";
import type { Field } from "@fiftyone/utilities";

function makeCommand(
  overrides: Partial<{
    labelId: string;
    labelType: string;
    gestureId: string;
  }> = {}
) {
  const labelId = overrides.labelId ?? "label-1";
  const labelType = overrides.labelType ?? "Detection";
  return {
    label: {
      type: labelType,
      path: "predictions",
      data: { _id: labelId, label: "cat" },
    } as LabelProxy,
    schema: { name: "detections" } as Field,
    gestureId: overrides.gestureId,
  };
}

describe("useRegisterAnnotationCommandHandlers", () => {
  let mockDeleteLabel: ReturnType<typeof vi.fn>;
  let mockPersist: ReturnType<typeof vi.fn>;
  let mockEngineDeleteLabel: ReturnType<typeof vi.fn>;
  let mockEngineTransaction: ReturnType<typeof vi.fn>;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteLabel = vi.fn();
    mockPersist = vi.fn().mockResolvedValue(true);
    mockEngineDeleteLabel = vi.fn();
    // run the body so the wrapped deleteLabel still executes
    mockEngineTransaction = vi.fn((fn: () => void) => fn());
    mockDispatch = vi.fn();

    vi.mocked(useDeleteLabel).mockReturnValue(mockDeleteLabel);
    vi.mocked(usePersistAnnotationDeltas).mockReturnValue(mockPersist);
    vi.mocked(useAnnotationEngine).mockReturnValue({
      deleteLabel: mockEngineDeleteLabel,
      transaction: mockEngineTransaction,
    } as any);
    vi.mocked(useActiveAnnotationSampleId).mockReturnValue("sample-1");
    vi.mocked(useAnnotationEventBus).mockReturnValue({
      dispatch: mockDispatch,
    } as any);
    // default: not a generated view
    vi.mocked(useRecoilValue).mockReturnValue(false);
  });

  function getRegisteredHandler() {
    renderHook(() => useRegisterAnnotationCommandHandlers());
    return vi.mocked(useRegisterCommandHandler).mock.calls[0][1] as (
      cmd: ReturnType<typeof makeCommand>
    ) => Promise<boolean>;
  }

  it("registers exactly one command handler on mount", () => {
    renderHook(() => useRegisterAnnotationCommandHandlers());

    expect(useRegisterCommandHandler).toHaveBeenCalledTimes(1);
  });

  describe("non-generated views", () => {
    it("removes the label through the engine and persists immediately (not the legacy path)", async () => {
      const handler = getRegisteredHandler();
      const cmd = makeCommand({ labelId: "label-42" });

      await handler(cmd);

      expect(mockEngineDeleteLabel).toHaveBeenCalledWith({
        sample: "sample-1",
        path: "predictions",
        instanceId: "label-42",
      });
      expect(mockPersist).toHaveBeenCalledTimes(1);
      expect(mockDeleteLabel).not.toHaveBeenCalled();
      // no gesture id → delete is its own undo unit, not wrapped in a keyed tx
      expect(mockEngineTransaction).not.toHaveBeenCalled();
    });

    it("keys the delete with the command's gestureId when one is given (merge)", async () => {
      const handler = getRegisteredHandler();

      await handler(
        makeCommand({ labelId: "label-42", gestureId: "gesture:1" })
      );

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
      const handler = getRegisteredHandler();

      await handler(
        makeCommand({ labelId: "label-42", labelType: "Polyline" })
      );

      expect(mockDispatch).toHaveBeenCalledWith(
        "annotation:persistenceSuccess"
      );
      expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteSuccess", {
        labelId: "label-42",
        type: "delete",
        labelType: "Polyline",
      });
    });

    it("dispatches deleteError + persistenceError when persistence fails", async () => {
      mockPersist.mockResolvedValue(false);
      const handler = getRegisteredHandler();

      const result = await handler(makeCommand({ labelId: "label-7" }));

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
      const handler = getRegisteredHandler();

      const result = await handler(makeCommand());

      expect(result).toBe(true);
    });

    it("dispatches deleteError and re-throws when persistence throws", async () => {
      const error = new Error("network down");
      mockPersist.mockRejectedValue(error);
      const handler = getRegisteredHandler();

      await expect(
        handler(makeCommand({ labelId: "label-99" }))
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

  describe("generated views", () => {
    beforeEach(() => {
      vi.mocked(useRecoilValue).mockReturnValue(true);
    });

    it("persists via the legacy delta path and clears the Sample transient", async () => {
      mockDeleteLabel.mockResolvedValue(true);
      const handler = getRegisteredHandler();
      const cmd = makeCommand({ labelId: "label-3", labelType: "Detection" });

      await handler(cmd);

      expect(mockEngineDeleteLabel).toHaveBeenCalledWith({
        sample: "sample-1",
        path: "predictions",
        instanceId: "label-3",
      });
      expect(mockDeleteLabel).toHaveBeenCalledWith(cmd.label, cmd.schema);
      expect(mockPersist).not.toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteSuccess", {
        labelId: "label-3",
        type: "delete",
        labelType: "Detection",
      });
    });

    it("dispatches deleteError when the legacy delete returns false", async () => {
      mockDeleteLabel.mockResolvedValue(false);
      const handler = getRegisteredHandler();

      const result = await handler(makeCommand({ labelId: "label-7" }));

      expect(result).toBe(false);
      expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
        labelId: "label-7",
        type: "delete",
      });
    });
  });
});
