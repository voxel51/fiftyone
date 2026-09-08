import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const bridgeSpy = vi.fn();
const media = { isVideo: false, isImageDynamicGroupVideo: false };

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => ({}),
  useLighterEngineBridge: (args: unknown) => bridgeSpy(args),
}));
vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetId: () => "dataset",
  useIsVideo: () => media.isVideo,
  useIsImageDynamicGroupVideo: () => media.isImageDynamicGroupVideo,
  useModalSample: () => null,
}));
vi.mock("@fiftyone/state/src/recoil/utils", () => ({
  getSampleSrc: (value: string) => value,
}));
vi.mock("@fiftyone/state/src/utils", () => ({
  getNormalizedUrls: () => ({}),
}));
vi.mock("./state", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai");
  return { visibleLabelSchemas: atom(new Set<string>()) };
});
vi.mock("./useLighterInteractionPolicy", () => ({
  useLighterInteractionPolicy: () => ({}),
}));
vi.mock("./useSyncOverlayReadOnly", () => ({
  useSyncOverlayReadOnly: () => undefined,
}));

import { useLighterAnnotationBridge } from "./useLighterAnnotationBridge";

const enabledFor = (isVideo: boolean, isImageDynamicGroupVideo: boolean) => {
  media.isVideo = isVideo;
  media.isImageDynamicGroupVideo = isImageDynamicGroupVideo;
  renderHook(() => useLighterAnnotationBridge());
  return bridgeSpy.mock.lastCall?.[0].enabled;
};

// The video surface mounts its own frame-stamping bridge on the same scene.
// This bridge must stay off there, or its frame-less selection becomes the
// anchor after a draw and the track loses its keyframe and auto-extend.
describe("useLighterAnnotationBridge", () => {
  afterEach(() => bridgeSpy.mockReset());

  it("drives the image surface", () => {
    expect(enabledFor(false, false)).toBe(true);
  });

  it("yields to the video surface for a video sample", () => {
    expect(enabledFor(true, false)).toBe(false);
  });

  it("yields to the video surface for an image dynamic group played as video", () => {
    expect(enabledFor(false, true)).toBe(false);
  });
});
