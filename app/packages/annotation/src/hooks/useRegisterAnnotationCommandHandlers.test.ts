import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventBus: vi.fn(),
}));

vi.mock("@fiftyone/command-bus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/command-bus")>();
  return {
    ...actual,
    useRegisterCommandHandler: vi.fn(),
  };
});

vi.mock("@fiftyone/state", () => ({
  useModalSample: vi.fn(),
}));

vi.mock("../persistence/useGetLabelDelta", () => ({
  useGetLabelDelta: vi.fn(),
}));

vi.mock("../persistence/useRecordEdit", () => ({
  useRecordEdit: vi.fn(),
}));

import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useModalSample } from "@fiftyone/state";
import type { LabelFieldDelta, LabelProxy } from "../deltas";
import { useGetLabelDelta } from "../persistence/useGetLabelDelta";
import { useRecordEdit } from "../persistence/useRecordEdit";
import { useRegisterAnnotationCommandHandlers } from "./useRegisterAnnotationCommandHandlers";

const DELTA: LabelFieldDelta = {
  field: "predictions",
  listKey: "detections",
  labelId: "label-1",
  previousValue: { _id: "label-1", label: "cat" },
  newValue: null,
};

function makeCommand(
  overrides: Partial<{ labelId: string; labelType: string }> = {}
) {
  const labelId = overrides.labelId ?? "label-1";
  const labelType = overrides.labelType ?? "Detection";
  return {
    label: {
      type: labelType,
      path: "predictions",
      data: { _id: labelId, label: "cat" },
    } as LabelProxy,
  };
}

describe("useRegisterAnnotationCommandHandlers", () => {
  let mockGetDeleteDelta: ReturnType<typeof vi.fn>;
  let mockRecordEdit: ReturnType<typeof vi.fn>;
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeleteDelta = vi.fn().mockReturnValue(DELTA);
    mockRecordEdit = vi.fn();
    mockDispatch = vi.fn();

    vi.mocked(useModalSample).mockReturnValue({
      sample: { _id: "sample-1" },
    } as never);
    vi.mocked(useGetLabelDelta).mockReturnValue(mockGetDeleteDelta);
    vi.mocked(useRecordEdit).mockReturnValue(mockRecordEdit);
    vi.mocked(useAnnotationEventBus).mockReturnValue({
      dispatch: mockDispatch,
    } as never);
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

  it("records the delete and dispatches deleteSuccess", async () => {
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-42", labelType: "Polyline" });

    const result = await handler(cmd);

    expect(result).toBe(true);
    expect(mockGetDeleteDelta).toHaveBeenCalledWith(cmd.label, "predictions");
    expect(mockRecordEdit).toHaveBeenCalledWith("sample-1", DELTA);
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteSuccess", {
      labelId: "label-42",
      type: "delete",
      labelType: "Polyline",
    });
  });

  it("dispatches deleteError when no delta can be captured", async () => {
    mockGetDeleteDelta.mockReturnValue(null);
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-7" });

    const result = await handler(cmd);

    expect(result).toBe(false);
    expect(mockRecordEdit).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-7",
      type: "delete",
    });
  });

  it("does not dispatch deleteSuccess on the failure path", async () => {
    mockGetDeleteDelta.mockReturnValue(null);
    const handler = getRegisteredHandler();

    await handler(makeCommand());

    expect(mockDispatch).not.toHaveBeenCalledWith(
      "annotation:deleteSuccess",
      expect.anything()
    );
  });

  it("dispatches deleteError when there is no modal sample", async () => {
    vi.mocked(useModalSample).mockReturnValue(undefined);
    const handler = getRegisteredHandler();

    const result = await handler(makeCommand());

    expect(result).toBe(false);
    expect(mockRecordEdit).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      "annotation:deleteError",
      expect.objectContaining({ type: "delete" })
    );
  });

  it("dispatches deleteError (with the error) and re-throws when recording throws", async () => {
    const error = new Error("record failed");
    mockRecordEdit.mockImplementation(() => {
      throw error;
    });
    const handler = getRegisteredHandler();
    const cmd = makeCommand({ labelId: "label-99" });

    await expect(handler(cmd)).rejects.toThrow("record failed");

    expect(mockDispatch).toHaveBeenCalledWith("annotation:deleteError", {
      labelId: "label-99",
      type: "delete",
      error,
    });
    expect(mockDispatch).not.toHaveBeenCalledWith(
      "annotation:deleteSuccess",
      expect.anything()
    );
  });
});
