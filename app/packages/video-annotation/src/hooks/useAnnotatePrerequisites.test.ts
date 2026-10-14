import type { ModalSample } from "@fiftyone/state";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isImageDynamicGroupVideo: false,
  frameRate: 30,
  elementCount: null as number | null,
}));

vi.mock("@fiftyone/state", () => ({
  useIsImageDynamicGroupVideo: () => state.isImageDynamicGroupVideo,
}));

vi.mock("../state/accessors", () => ({
  useModalSampleFrameRate: () => state.frameRate,
  useDynamicGroupElementCount: (enabled: boolean) =>
    enabled ? state.elementCount : null,
}));

import { useAnnotatePrerequisites } from "./useAnnotatePrerequisites";

const sampleWith = (
  frameRate: unknown,
  metadata: Record<string, unknown>,
): ModalSample =>
  ({ frameRate, sample: { metadata } }) as unknown as ModalSample;

beforeEach(() => {
  state.isImageDynamicGroupVideo = false;
  state.frameRate = 30;
  state.elementCount = null;
});

describe("useAnnotatePrerequisites", () => {
  it("is ready when metadata resolves a frame rate + count", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, { total_frame_count: 90 })),
    );

    expect(result.current).toEqual({
      status: "ready",
      frameRate: 30,
      frameCount: 90,
    });
  });

  it("blocks on metadata when frameRate is missing", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(
        sampleWith(undefined, { total_frame_count: 90 }),
      ),
    );

    expect(result.current).toEqual({ status: "blocked", blocker: "metadata" });
  });

  it("blocks on metadata when frame count is unresolvable", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, {})),
    );

    expect(result.current).toEqual({ status: "blocked", blocker: "metadata" });
  });
});

describe("useAnnotatePrerequisites (image dynamic group video)", () => {
  it("is ready from the target frame rate + element count, no VideoMetadata", () => {
    state.isImageDynamicGroupVideo = true;
    state.frameRate = 5;
    state.elementCount = 42;

    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(undefined, {})),
    );

    expect(result.current).toEqual({
      status: "ready",
      frameRate: 5,
      frameCount: 42,
    });
  });

  it("blocks when the group is empty", () => {
    state.isImageDynamicGroupVideo = true;
    state.frameRate = 5;
    state.elementCount = 0;

    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(undefined, {})),
    );

    expect(result.current).toEqual({ status: "blocked", blocker: "metadata" });
  });
});
