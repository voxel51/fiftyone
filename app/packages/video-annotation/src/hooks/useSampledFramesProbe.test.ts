import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  responseHasSampledFrames,
  useSampledFramesProbe,
} from "./useSampledFramesProbe";

const { fetchFn } = vi.hoisted(() => ({ fetchFn: vi.fn() }));

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => fetchFn,
}));

vi.mock("../state/accessors", () => ({
  useDatasetName: () => "d1",
  useView: () => [],
  useGroupSlice: () => null,
  useModalSampleId: () => "s1",
}));

/** Flush the probe's fetch-resolve → setState microtask chain inside act. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  fetchFn.mockReset();
});

describe("responseHasSampledFrames", () => {
  it("is true only when frame 1 carries a non-empty filepath", () => {
    expect(
      responseHasSampledFrames({
        frames: [{ frame_number: 1, filepath: "/a.jpg" }],
      }),
    ).toBe(true);
    expect(responseHasSampledFrames({ frames: [{ frame_number: 1 }] })).toBe(
      false,
    );
    expect(
      responseHasSampledFrames({ frames: [{ frame_number: 1, filepath: "" }] }),
    ).toBe(false);
    expect(responseHasSampledFrames({ frames: [] })).toBe(false);
    expect(responseHasSampledFrames({})).toBe(false);
  });
});

describe("useSampledFramesProbe", () => {
  it("stays checking and issues no request while disabled", () => {
    const { result } = renderHook(() => useSampledFramesProbe(90, false));

    expect(result.current).toBe("checking");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports sampled when frame 1 has a filepath", async () => {
    fetchFn.mockResolvedValue({
      frames: [{ frame_number: 1, filepath: "/a/1.jpg" }],
    });

    const { result } = renderHook(() => useSampledFramesProbe(90, true));
    await flush();

    expect(result.current).toBe("sampled");
    expect(fetchFn).toHaveBeenCalledWith(
      "POST",
      "/frames",
      expect.objectContaining({
        frameNumber: 1,
        numFrames: 1,
        fields: ["filepath"],
      }),
    );
  });

  it("reports unsampled when frame 1 has no filepath", async () => {
    fetchFn.mockResolvedValue({ frames: [{ frame_number: 1 }] });

    const { result } = renderHook(() => useSampledFramesProbe(90, true));
    await flush();

    expect(result.current).toBe("unsampled");
  });

  it("treats a probe error as inconclusive so it doesn't wrongly block", async () => {
    fetchFn.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useSampledFramesProbe(90, true));
    await flush();

    expect(result.current).toBe("sampled");
  });
});
