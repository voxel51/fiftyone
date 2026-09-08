import { describe, expect, it } from "vitest";
import { AUTO_EXTEND_FRAMES, autoExtendTargetFrames } from "./autoExtend";

describe("autoExtendTargetFrames", () => {
  it("fills the next AUTO_EXTEND_FRAMES frames after the draw", () => {
    const frames = autoExtendTargetFrames(10, 1000);
    expect(frames[0]).toBe(11);
    expect(frames).toHaveLength(AUTO_EXTEND_FRAMES);
    expect(frames[frames.length - 1]).toBe(10 + AUTO_EXTEND_FRAMES);
  });

  it("clamps to the inclusive clip length", () => {
    // drawn at frame 95 of a 100-frame clip → only 96..100
    expect(autoExtendTargetFrames(95, 100)).toEqual([96, 97, 98, 99, 100]);
  });

  it("is empty when drawn on the last frame", () => {
    expect(autoExtendTargetFrames(100, 100)).toEqual([]);
  });
});
