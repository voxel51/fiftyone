import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventBus: vi.fn(),
  useDeleteLabel: vi.fn(),
}));

vi.mock("@fiftyone/command-bus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/command-bus")>();
  return {
    ...actual,
    useRegisterCommandHandler: vi.fn(),
  };
});

import { useAnnotationEventBus, useDeleteLabel } from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useRegisterAnnotationCommandHandlers } from "./useRegisterAnnotationCommandHandlers";
import type { LabelProxy } from "../deltas";
import type { Field } from "@fiftyone/utilities";

function makeCommand(
  overrides: Partial<{ labelId: string; labelType: string }> = {},
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
  };
}

describe("useRegisterAnnotationCommandHandlers", () => {
  let mockDeleteLabel: ReturnType<typeof vi.fn>;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteLabel = vi.fn();
    mockDispatch = vi.fn();

    vi.mocked(useDeleteLabel).mockReturnValue(mockDeleteLabel);
    vi.mocked(useAnnotationEventBus).mockReturnValue({
      dispatch: mockDispatch,
    } as any);
  });

  function getRegisteredHandler() {
    renderHook(() => useRegisterAnnotationCommandHandlers());
    return vi.mocked(useRegisterCommandHandler).mock.calls[0][1] as (
      cmd: ReturnType<typeof makeCommand>,
    ) => Promise<boolean>;
  }

  it("registers exactly one command handler on mount", () => {
    renderHook(() => useRegisterAnnotationCommandHandlers());

    expect(useRegisterCommandHandler).toHaveBeenCalledTimes(1);
  });

  it("dispatches deleteSuccess with label metadata when deleteLabel returns true", async () => {
    mockDeleteLabel.mockResolvedValue(true);
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-42", labelType: "Polyline" });

    await handler(cmd);

    expect(mockDeleteLabel).toHaveBeenCalledWith(cmd.label, cmd.schema);
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteSuccess", {
      labelId: "label-42",
      type: "delete",
      labelType: "Polyline",
    });
  });

  it("dispatches deleteError when deleteLabel returns false", async () => {
    mockDeleteLabel.mockResolvedValue(false);
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-7" });

    await handler(cmd);

    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-7",
      type: "delete",
    });
  });

  it("does not dispatch deleteSuccess when deleteLabel returns false", async () => {
    mockDeleteLabel.mockResolvedValue(false);
    const handler = getRegisteredHandler();

    await handler(makeCommand());

    expect(mockDispatch).not.toHaveBeenCalledWith(
      "annotation:deleteSuccess",
      expect.anything(),
    );
  });

  it("dispatches deleteError and re-throws when deleteLabel throws", async () => {
    const error = new Error("deletion failed");
    mockDeleteLabel.mockRejectedValue(error);
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-99" });

    await expect(handler(cmd)).rejects.toThrow("deletion failed");

    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-99",
      type: "delete",
      error,
    });
  });

  it("returns the result of deleteLabel on success", async () => {
    mockDeleteLabel.mockResolvedValue(true);
    const handler = getRegisteredHandler();

    const result = await handler(makeCommand());

    expect(result).toBe(true);
  });

  it("returns the result of deleteLabel on failure", async () => {
    mockDeleteLabel.mockResolvedValue(false);
    const handler = getRegisteredHandler();

    const result = await handler(makeCommand());

    expect(result).toBe(false);
  });
});
