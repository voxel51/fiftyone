/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

import { CONTAINS } from "./base";
import KeypointOverlay, { getKeypointPoints } from "./keypoint";

const state = {
  canvasBBox: [0, 0, 100, 100],
  config: { thumbnail: false },
  dimensions: [100, 100],
  options: {
    coloring: { points: false },
    labelSelectionStyle: {},
    pointFilter: () => true,
    selectedLabels: [],
    selectedLabelTypes: {},
  },
  pixelCoordinates: [50, 50],
  pointRadius: 3,
  strokeWidth: 2,
} as never;

const mockContext = () =>
  ({
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  }) as unknown as CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>;
  };

describe("a keypoint without points", () => {
  const overlay = new KeypointOverlay("keypoints", {
    id: "keypoint",
    label: "person",
    tags: [],
  });
  vi.spyOn(overlay, "getColor").mockReturnValue("#ff0000");

  it("draws nothing and does not throw", () => {
    const ctx = mockContext();

    expect(() => overlay.draw(ctx, state)).not.toThrow();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("is never under the cursor", () => {
    expect(overlay.containsPoint(state)).toBe(CONTAINS.NONE);
    expect(overlay.getMouseDistance(state)).toBe(Infinity);
  });

  it("has no points", () => {
    expect(overlay.getPoints()).toEqual([]);
    expect(getKeypointPoints([{ points: undefined } as never])).toEqual([]);
  });
});
