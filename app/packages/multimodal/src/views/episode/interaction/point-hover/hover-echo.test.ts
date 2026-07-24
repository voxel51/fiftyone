import { describe, expect, it } from "vitest";

import { hoverMatchesPointFrame, type HoverEcho } from "./hover-echo";

const HOVER: HoverEcho = {
  color: [1, 0, 0],
  contentTimeNs: 42n,
  fields: { intensity: 0.5 },
  frameId: "lidar",
  kind: "point",
  pointIndex: 7,
  position: [1, 2, 3],
  stream: "/lidar",
  worldFrameId: "map",
  worldPosition: [11, 12, 13],
};

describe("point hover echo", () => {
  it("matches only the exact source frame", () => {
    expect(hoverMatchesPointFrame(HOVER, "/lidar", 42n)).toBe(true);
    expect(hoverMatchesPointFrame(HOVER, "/lidar", 43n)).toBe(false);
    expect(hoverMatchesPointFrame(HOVER, "/other", 42n)).toBe(false);
    expect(hoverMatchesPointFrame(HOVER, "/lidar", undefined)).toBe(false);
  });
});
