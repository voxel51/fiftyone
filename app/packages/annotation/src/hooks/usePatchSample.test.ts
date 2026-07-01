import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../util", () => ({
  doPatchSample: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  generatedDatasetName: null,
  isGeneratedView: false,
  useCurrentDatasetId: vi.fn(),
  useModalSample: vi.fn(),
  useRefreshSample: vi.fn(),
}));

import { doPatchSample } from "../util";
import { usePatchSampleWith } from "./usePatchSample";
import type { Sample } from "@fiftyone/looker";
import type { JSONDeltas } from "@fiftyone/core/src/client";

const SAMPLE: Sample = { id: "sample-1" } as Sample;
const DATASET_ID = "dataset-1";
const VERSION_TOKEN = "tok-abc";
const DELTAS: JSONDeltas = [
  { path: "/label", value: "cat", op: "replace" },
] as any;

function makeArgs(overrides = {}) {
  return {
    sample: SAMPLE,
    datasetId: DATASET_ID,
    getVersionToken: vi.fn().mockReturnValue(VERSION_TOKEN),
    refreshSample: vi.fn(),
    isGenerated: false,
    generatedDatasetName: null,
    ...overrides,
  };
}

describe("usePatchSampleWith", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doPatchSample).mockResolvedValue(true);
  });

  it("delegates to doPatchSample with the provided sample and deltas", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => usePatchSampleWith(args));

    await result.current(DELTAS);

    expect(doPatchSample).toHaveBeenCalledWith(
      expect.objectContaining({
        sample: SAMPLE,
        datasetId: DATASET_ID,
        sampleDeltas: DELTAS,
      }),
    );
  });

  it("passes all constructor args through to doPatchSample", async () => {
    const args = makeArgs({
      isGenerated: true,
      generatedDatasetName: "gen-ds",
    });
    const { result } = renderHook(() => usePatchSampleWith(args));

    await result.current(DELTAS);

    expect(doPatchSample).toHaveBeenCalledWith(
      expect.objectContaining({
        isGenerated: true,
        generatedDatasetName: "gen-ds",
        getVersionToken: args.getVersionToken,
        refreshSample: args.refreshSample,
      }),
    );
  });

  it("passes patchOptions to doPatchSample", async () => {
    const { result } = renderHook(() => usePatchSampleWith(makeArgs()));

    await result.current(DELTAS, {
      labelId: "l-1",
      labelPath: "predictions",
      opType: "mutate",
    });

    expect(doPatchSample).toHaveBeenCalledWith(
      expect.objectContaining({
        labelId: "l-1",
        labelPath: "predictions",
        opType: "mutate",
      }),
    );
  });

  it("passes undefined for unspecified patchOptions fields", async () => {
    const { result } = renderHook(() => usePatchSampleWith(makeArgs()));

    await result.current(DELTAS);

    expect(doPatchSample).toHaveBeenCalledWith(
      expect.objectContaining({
        labelId: undefined,
        labelPath: undefined,
        opType: undefined,
      }),
    );
  });

  it("returns true when doPatchSample succeeds", async () => {
    vi.mocked(doPatchSample).mockResolvedValue(true);
    const { result } = renderHook(() => usePatchSampleWith(makeArgs()));

    expect(await result.current(DELTAS)).toBe(true);
  });

  it("returns false when doPatchSample fails", async () => {
    vi.mocked(doPatchSample).mockResolvedValue(false);
    const { result } = renderHook(() => usePatchSampleWith(makeArgs()));

    expect(await result.current(DELTAS)).toBe(false);
  });

  it("propagates errors from doPatchSample", async () => {
    vi.mocked(doPatchSample).mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => usePatchSampleWith(makeArgs()));

    await expect(result.current(DELTAS)).rejects.toThrow("network error");
  });
});
