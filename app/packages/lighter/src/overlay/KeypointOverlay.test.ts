/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
import { MockRenderer2D } from "../renderer/MockRenderer2D";
import { NO_BOUNDS } from "./DetectionOverlay";
import { KeypointOverlay, type KeypointLabel } from "./KeypointOverlay";

/**
 * Builds a KeypointOverlay over an identity-over-100x100 media region, so
 * world points equal relative points * 100 (cf. MaskKeypoints.test.ts).
 */
const makeOverlay = (
  points: [number, number][],
  connections: number[][] = [],
): KeypointOverlay => {
  const renderer = new MockRenderer2D();
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });

  const overlay = new KeypointOverlay({
    id: "kp-test",
    field: "keypoints",
    label: { label: "person", points } as KeypointLabel,
    connections,
  });
  overlay.setRenderer(renderer);
  overlay.setCoordinateSystem(coordinateSystem);

  return overlay;
};

const HOLE: [number, number] = [NaN, NaN];

describe("KeypointOverlay non-finite handling", () => {
  it("sanitizes 'nan'-string coordinates from sample reads into holes", () => {
    const overlay = makeOverlay([
      [0.1, 0.2],
      // the server serializes float('nan') as the string "nan"
      ["nan", "nan"] as unknown as [number, number],
    ]);

    const points = overlay.getRelativePoints();
    expect(points[0]).toEqual([0.1, 0.2]);
    expect(points[1][0]).toBeNaN();
    expect(points[1][1]).toBeNaN();
  });

  it("treats a point with any non-finite coordinate as a hole", () => {
    const overlay = makeOverlay([
      [NaN, 0.5] as [number, number],
      [0.5, Infinity] as [number, number],
    ]);

    for (const point of overlay.getRelativePoints()) {
      expect(point[0]).toBeNaN();
      expect(point[1]).toBeNaN();
    }
  });

  it("excludes holes from bounds", () => {
    const overlay = makeOverlay([[0.2, 0.2], HOLE, [0.4, 0.4]]);

    const bounds = overlay.relativeBounds;
    expect(bounds.x).toBeCloseTo(0.2);
    expect(bounds.y).toBeCloseTo(0.2);
    expect(bounds.width).toBeCloseTo(0.2);
    expect(bounds.height).toBeCloseTo(0.2);
  });

  it("has no bounds when every point is a hole", () => {
    const overlay = makeOverlay([HOLE, HOLE]);
    expect(overlay.relativeBounds).toEqual(NO_BOUNDS);
    expect(overlay.bounds).toEqual(NO_BOUNDS);
  });

  it("keeps holes at their index so skeleton identity is stable", () => {
    const overlay = makeOverlay([[0.1, 0.1], HOLE, [0.9, 0.9]]);
    expect(overlay.getPointCount()).toBe(3);
    expect(overlay.getRelativePoints()[2]).toEqual([0.9, 0.9]);
  });
});

describe("KeypointOverlay.applyLabel", () => {
  it("rebuilds point geometry from the label (Sample→overlay reconciliation)", () => {
    const overlay = makeOverlay([HOLE, HOLE]);

    overlay.applyLabel({
      label: "person",
      points: [
        [0.3, 0.3],
        [0.6, 0.6],
      ],
    } as KeypointLabel);

    expect(overlay.getRelativePoints()).toEqual([
      [0.3, 0.3],
      [0.6, 0.6],
    ]);
  });

  it("keeps point ids stable across a reconciliation", () => {
    const overlay = makeOverlay([[0.1, 0.1], HOLE]);
    const idBefore = overlay.getPointIdAt(0);

    overlay.applyLabel({
      label: "person",
      points: [
        [0.2, 0.2],
        [0.5, 0.5],
      ],
    } as KeypointLabel);

    expect(overlay.getPointIdAt(0)).toBe(idBefore);
  });

  it("sanitizes 'nan' strings applied through a label update", () => {
    const overlay = makeOverlay([[0.1, 0.1]]);

    overlay.applyLabel({
      label: "person",
      points: [["nan", "nan"]] as unknown as [number, number][],
    } as KeypointLabel);

    expect(overlay.getRelativePoints()[0][0]).toBeNaN();
  });

  it("moving a hole to a position makes it placed (guided placement)", () => {
    const overlay = makeOverlay([HOLE, HOLE], [[0, 1]]);
    const holeId = overlay.getPointIdAt(0);
    expect(holeId).not.toBeNull();

    overlay.movePointById(holeId as string, [0.4, 0.4], false);

    const points = overlay.getRelativePoints();
    expect(points[0]).toEqual([0.4, 0.4]);
    expect(points[1][0]).toBeNaN();
  });
});
