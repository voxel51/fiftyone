/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { PolylineOverlay, type PolylineLabel } from "./PolylineOverlay";
import { KeypointOverlay, type KeypointLabel } from "./KeypointOverlay";

const keypoint = (points: [number, number][]) =>
  new KeypointOverlay({
    id: "k",
    field: "keypoints",
    label: { label: "person", points } as KeypointLabel,
  });

const polyline = (points: [number, number][][], closed = false) =>
  new PolylineOverlay({
    id: "p",
    field: "polylines",
    label: { label: "road", points, closed } as PolylineLabel,
  });

describe("KeypointOverlay", () => {
  it("absorbs an applied label's points", () => {
    const overlay = keypoint([[0.1, 0.1]]);

    overlay.applyLabel({
      label: "person",
      points: [
        [0.5, 0.5],
        [0.6, 0.6],
      ],
    } as KeypointLabel);

    expect(overlay.getRelativePoints()).toEqual([
      [0.5, 0.5],
      [0.6, 0.6],
    ]);
  });

  it("clamps points outside the frame and keeps missing ones", () => {
    const overlay = keypoint([
      [-0.5, 0.5],
      [NaN, NaN],
      [0.5, 0.5],
    ]);

    expect(overlay.clipToFrame()).toBe("clipped");
    expect(overlay.getRelativePoints()).toEqual([
      [0, 0.5],
      [NaN, NaN],
      [0.5, 0.5],
    ]);
    expect(overlay.clipToFrame()).toBe("unchanged");
  });
});

describe("PolylineOverlay", () => {
  it("absorbs an applied label's nested shapes", () => {
    const overlay = polyline([[[0.1, 0.1]]]);

    overlay.applyLabel({
      label: "road",
      points: [
        [
          [0.2, 0.2],
          [0.3, 0.3],
        ],
        [[0.4, 0.4]],
      ],
    } as unknown as KeypointLabel);

    expect(overlay.getNestedPoints()).toEqual([
      [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
      [[0.4, 0.4]],
    ]);
  });

  it("clips a closed shape and reports a shape wholly outside as empty", () => {
    const overlay = polyline(
      [
        [
          [0.5, 0.25],
          [1.5, 0.25],
          [1.5, 0.75],
          [0.5, 0.75],
        ],
      ],
      true,
    );

    expect(overlay.clipToFrame()).toBe("clipped");
    expect(overlay.getNestedPoints()).toEqual([
      [
        [0.5, 0.25],
        [1, 0.25],
        [1, 0.75],
        [0.5, 0.75],
      ],
    ]);
    expect(overlay.getClosed()).toBe(true);

    const outside = polyline([
      [
        [1.25, 0.25],
        [1.5, 0.5],
      ],
    ]);
    expect(outside.clipToFrame()).toBe("empty");
  });
});
