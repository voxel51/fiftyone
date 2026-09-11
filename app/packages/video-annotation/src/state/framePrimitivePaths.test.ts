import { describe, expect, it } from "vitest";
import { toFramePrimitivePaths } from "./accessors";

const PRIMITIVES = [
  "frames.frame_number",
  "frames.weather",
  "timestamp",
  "weather",
];

describe("toFramePrimitivePaths", () => {
  it("a video owns its active frames.* primitives only", () => {
    expect(
      toFramePrimitivePaths(
        ["frames.weather", "weather", "frames.detections"],
        PRIMITIVES,
        false,
      ),
    ).toEqual(["frames.weather"]);
  });

  it("an image dynamic group played as video owns its active bare primitives", () => {
    expect(
      toFramePrimitivePaths(
        ["timestamp", "weather", "detections"],
        PRIMITIVES,
        true,
      ),
    ).toEqual(["timestamp", "weather"]);
  });

  it("returns nothing when no primitive is active", () => {
    expect(toFramePrimitivePaths([], PRIMITIVES, true)).toEqual([]);
  });

  it("a dynamic group's order-by field streams whether or not it is active", () => {
    expect(
      toFramePrimitivePaths(["weather"], PRIMITIVES, true, "timestamp"),
    ).toEqual(["timestamp", "weather"]);
    expect(
      toFramePrimitivePaths(["timestamp"], PRIMITIVES, true, "timestamp"),
    ).toEqual(["timestamp"]);
  });
});
