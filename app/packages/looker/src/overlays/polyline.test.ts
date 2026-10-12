/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

import { CONTAINS } from "./base";
import PolylineOverlay, { PolylineLabel } from "./polyline";

const state = {
  canvasBBox: [0, 0, 100, 100],
  config: { thumbnail: false },
  dashLength: 4,
  dimensions: [100, 100],
  fontSize: 12,
  options: {
    alpha: 0.7,
    labelSelectionStyle: {},
    selectedLabels: [],
    selectedLabelTypes: {},
  },
  pixelCoordinates: [50, 50],
  pointRadius: 3,
  strokeWidth: 2,
  textPad: 2,
  windowBBox: [0, 0, 100, 100],
} as never;

describe("a closed polyline with an empty shape", () => {
  const overlay = new PolylineOverlay("polylines", {
    id: "polyline",
    label: "lane",
    tags: [],
    closed: true,
    filled: true,
    points: [
      [],
      [
        [0.1, 0.1],
        [0.2, 0.1],
        [0.2, 0.2],
      ],
    ],
  } as PolylineLabel);
  vi.spyOn(overlay, "getColor").mockReturnValue("#ff0000");

  it("hit-tests the shapes it has", () => {
    expect(() => overlay.containsPoint(state)).not.toThrow();
    expect(overlay.containsPoint(state)).toBe(CONTAINS.NONE);
    expect(overlay.getMouseDistance(state)).toBeCloseTo(Math.hypot(30, 30));
  });
});
