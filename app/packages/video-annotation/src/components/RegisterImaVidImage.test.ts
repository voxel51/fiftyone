import type { ModalSample } from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { resolveFrameCount } from "./RegisterImaVidImage";

const sampleWith = (metadata: Record<string, unknown>): ModalSample =>
  ({ sample: { metadata } } as unknown as ModalSample);

describe("resolveFrameCount", () => {
  it("prefers total_frame_count, rounded", () => {
    expect(
      resolveFrameCount(sampleWith({ total_frame_count: 119.6 }), 30)
    ).toBe(120);
  });

  it("falls back to duration * frameRate when total_frame_count is absent", () => {
    expect(resolveFrameCount(sampleWith({ duration: 4 }), 30)).toBe(120);
  });

  it("ignores a non-positive total_frame_count and uses duration", () => {
    expect(
      resolveFrameCount(sampleWith({ total_frame_count: 0, duration: 2 }), 30)
    ).toBe(60);
  });

  it("throws when neither total_frame_count nor duration is present", () => {
    expect(() => resolveFrameCount(sampleWith({}), 30)).toThrow();
  });
});
