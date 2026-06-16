import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A real-enough SaveConflictError so the hook's `instanceof` check holds.
vi.mock("@fiftyone/core/src/client", () => {
  class SaveConflictError extends Error {
    constructor(readonly conflicts: unknown[] = []) {
      super("conflict");
      this.name = "Save Conflict Error";
    }
  }
  return { SaveConflictError };
});

vi.mock("@fiftyone/state", () => ({
  generatedDatasetName: { key: "generatedDatasetName" },
  isGeneratedView: { key: "isGeneratedView" },
  getLocalSample: vi.fn(),
  useCurrentDatasetId: vi.fn(),
  useModalSample: vi.fn(),
  useUpdateSamples: vi.fn(),
}));

vi.mock("recoil", () => ({ useRecoilValue: vi.fn(() => undefined) }));

vi.mock("../hooks", () => ({ useAnnotationEventBus: vi.fn() }));
vi.mock("../util", () => ({ saveAnnotationDeltas: vi.fn() }));
vi.mock("./useAnnotationDeltaSupplier", () => ({
  useAnnotationDeltaSupplier: vi.fn(() => () => ({ deltas: [] })),
}));
vi.mock("./useRecordEdit", () => ({ useRecordEdit: vi.fn(() => vi.fn()) }));

import { SaveConflictError } from "@fiftyone/core/src/client";
import {
  getLocalSample,
  useCurrentDatasetId,
  useModalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import { useAnnotationEventBus } from "../hooks";
import { saveAnnotationDeltas } from "../util";
import { pendingEdits } from "./pendingEdits";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

const DELTA = {
  field: "ground_truth",
  listKey: "detections",
  labelId: "det-1",
  previousValue: null,
  newValue: { _id: "det-1", label: "cat" },
};

const seedPending = () => pendingEdits.record("s1", DELTA);

describe("usePersistAnnotationDeltas", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    pendingEdits.reset();
    mockDispatch = vi.fn();

    vi.mocked(useCurrentDatasetId).mockReturnValue("ds1");
    vi.mocked(useModalSample).mockReturnValue({
      sample: { _id: "s1" },
    } as never);
    vi.mocked(useUpdateSamples).mockReturnValue(vi.fn());
    vi.mocked(useAnnotationEventBus).mockReturnValue({
      dispatch: mockDispatch,
    } as never);
    vi.mocked(getLocalSample).mockImplementation(
      (id: string) => ({ _id: id } as never)
    );
  });

  const flush = () => {
    const { result } = renderHook(() => usePersistAnnotationDeltas());
    return result.current();
  };

  it("returns null and sends nothing when there is no dataset id", async () => {
    vi.mocked(useCurrentDatasetId).mockReturnValue(null);
    seedPending();

    expect(await flush()).toBeNull();
    expect(saveAnnotationDeltas).not.toHaveBeenCalled();
  });

  it("returns null when there are no pending edits", async () => {
    expect(await flush()).toBeNull();
    expect(saveAnnotationDeltas).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith(
      "annotation:persistenceInFlight"
    );
  });

  it("flushes the pending batch and returns true on success", async () => {
    vi.mocked(saveAnnotationDeltas).mockResolvedValue(true);
    seedPending();

    expect(await flush()).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith("annotation:persistenceInFlight");

    const [deltas, ctx] = vi.mocked(saveAnnotationDeltas).mock.calls[0];
    expect(deltas).toHaveLength(1);
    expect(ctx).toMatchObject({ datasetId: "ds1", sample: { _id: "s1" } });
  });

  it("returns false on a non-conflict failure", async () => {
    vi.mocked(saveAnnotationDeltas).mockResolvedValue(false);
    seedPending();

    expect(await flush()).toBe(false);
  });

  it("re-throws a SaveConflictError so the caller can surface it", async () => {
    vi.mocked(saveAnnotationDeltas).mockRejectedValue(new SaveConflictError());
    seedPending();

    await expect(flush()).rejects.toBeInstanceOf(SaveConflictError);
  });

  it("flushes every sample with pending edits, not just the modal sample", async () => {
    vi.mocked(saveAnnotationDeltas).mockResolvedValue(true);
    // An edit recorded against a sample the modal already navigated away from.
    pendingEdits.record("other-sample", DELTA);
    seedPending();

    await flush();

    const flushedIds = vi
      .mocked(saveAnnotationDeltas)
      .mock.calls.map(([, ctx]) => (ctx.sample as { _id: string })._id)
      .sort();
    expect(flushedIds).toEqual(["other-sample", "s1"]);
  });
});
