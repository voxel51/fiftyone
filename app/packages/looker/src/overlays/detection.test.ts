/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";

import { CONTAINS } from "./base";
import DetectionOverlay, { DetectionLabel } from "./detection";

describe("a 3D detection has no 2D box to hit-test", () => {
  const overlay = new DetectionOverlay("detections", {
    id: "cuboid",
    label: "car",
    location: [0, 0, 0],
    dimensions: [1, 1, 1],
    rotation: [0, 0, 0],
  } as DetectionLabel);
  const state = {
    pixelCoordinates: [0, 0],
    dimensions: [10, 10],
    strokeWidth: 1,
    canvasBBox: [0, 0, 10, 10],
  } as never;

  it("is never under the cursor", () => {
    expect(overlay.containsPoint(state)).toBe(CONTAINS.NONE);
  });

  it("is infinitely far from the cursor", () => {
    expect(overlay.getMouseDistance(state)).toBe(Infinity);
  });
});
