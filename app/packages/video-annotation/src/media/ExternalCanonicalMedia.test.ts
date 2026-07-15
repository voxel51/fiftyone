import { describe, expect, it } from "vitest";
import { letterboxRect } from "./ExternalCanonicalMedia";

describe("letterboxRect", () => {
  it("fills exactly when aspect ratios match", () => {
    expect(letterboxRect({ width: 1920, height: 1080 }, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it("pillarboxes media wider than the container", () => {
    expect(letterboxRect({ width: 200, height: 100 }, 100, 100)).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it("letterboxes media taller than the container", () => {
    expect(letterboxRect({ width: 100, height: 200 }, 100, 100)).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 100,
    });
  });
});
