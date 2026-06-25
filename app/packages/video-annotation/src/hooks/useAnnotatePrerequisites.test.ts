import type { ModalSample } from "@fiftyone/state";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnotatePrerequisites } from "./useAnnotatePrerequisites";
import type { SampledFramesState } from "./useSampledFramesProbe";

let probeState: SampledFramesState = "sampled";

vi.mock("./useSampledFramesProbe", () => ({
  useSampledFramesProbe: () => probeState,
}));

const sampleWith = (
  frameRate: unknown,
  metadata: Record<string, unknown>
): ModalSample =>
  ({ frameRate, sample: { metadata } } as unknown as ModalSample);

beforeEach(() => {
  probeState = "sampled";
});

describe("useAnnotatePrerequisites", () => {
  it("is ready when metadata is present and frames are sampled", () => {
    probeState = "sampled";
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({
      status: "ready",
      frameRate: 30,
      frameCount: 90,
    });
  });

  it("reports checking while the frames probe is in flight", () => {
    probeState = "checking";
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({
      status: "checking",
      frameRate: 30,
      frameCount: 90,
    });
  });

  it("blocks on frames when the video isn't sampled", () => {
    probeState = "unsampled";
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({
      status: "blocked",
      blocker: "frames",
      frameRate: 30,
      frameCount: 90,
    });
  });

  it("blocks on metadata when frameRate is missing", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(undefined, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({ status: "blocked", blocker: "metadata" });
  });

  it("blocks on metadata when frame count is unresolvable", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, {}))
    );

    expect(result.current).toEqual({ status: "blocked", blocker: "metadata" });
  });
});
