import type { ModalSample } from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { resolveFrameCount } from "./frameCount";

const sampleWith = (metadata: Record<string, unknown>): ModalSample =>
  ({ sample: { metadata } }) as unknown as ModalSample;

describe("resolveFrameCount", () => {
  it("prefers total_frame_count, rounded", () => {
    expect(
      resolveFrameCount(sampleWith({ total_frame_count: 119.6 }), 30),
    ).toBe(120);
  });

  it("falls back to duration * frameRate when total_frame_count is absent", () => {
    expect(resolveFrameCount(sampleWith({ duration: 4 }), 30)).toBe(120);
  });

  it("counts a partial trailing frame in the duration fallback", () => {
    // 10.01s at 30fps = 300 full frames + a partial 301st starting at 10.0.
    expect(resolveFrameCount(sampleWith({ duration: 10.01 }), 30)).toBe(301);
  });

  it("does not mint a frame past the media from float error at an exact multiple", () => {
    // NTSC: 120 frames at 30000/1001 fps; duration * fps lands at
    // 120 ± float noise and must resolve to exactly 120, never 121.
    const fps = 30000 / 1001;
    expect(resolveFrameCount(sampleWith({ duration: 120 / fps }), fps)).toBe(
      120,
    );
  });

  it("ignores a non-positive total_frame_count and uses duration", () => {
    expect(
      resolveFrameCount(sampleWith({ total_frame_count: 0, duration: 2 }), 30),
    ).toBe(60);
  });

  it("returns null when neither total_frame_count nor duration is present", () => {
    expect(resolveFrameCount(sampleWith({}), 30)).toBeNull();
  });
});
