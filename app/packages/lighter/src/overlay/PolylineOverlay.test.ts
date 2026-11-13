/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
// Through the package entry: importing an overlay module first trips a
// pre-existing import cycle (PolylineOverlay extends KeypointOverlay).
import { PolylineOverlay, type PolylineLabel } from "../index";
import { MockRenderer2D } from "../renderer/MockRenderer2D";

const make = (points: [number, number][][]): PolylineOverlay => {
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });

  const overlay = new PolylineOverlay({
    id: "pl-test",
    field: "polylines",
    label: { label: "road", points, closed: false },
  });
  overlay.setRenderer(new MockRenderer2D());
  overlay.setCoordinateSystem(coordinateSystem);

  return overlay;
};

const label = (points: [number, number][][]): PolylineLabel => ({
  label: "road",
  points,
  closed: false,
});

describe("PolylineOverlay label geometry", () => {
  it("reads its nested segments as one flat point list", () => {
    const overlay = make([
      [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      [[0.5, 0.5]],
    ]);

    expect(overlay.getRelativePoints()).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
      [0.5, 0.5],
    ]);
    expect(overlay.getNestedPoints()).toEqual([
      [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      [[0.5, 0.5]],
    ]);
  });

  // Review of the keypoint PR (2026-09-30): applyLabel used to skip the
  // parent chain, so polylines regenerated every point id and dropped the
  // selected point; it now chains through KeypointOverlay.applyLabel
  it("applies a label through the keypoint overlay, keeping point ids", () => {
    const overlay = make([
      [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    ]);
    const idBefore = overlay.getPointIdAt(1);
    overlay.selectPoint(1);

    overlay.applyLabel(
      label([
        [
          [0.3, 0.3],
          [0.4, 0.4],
        ],
      ]),
    );

    expect(overlay.getPointIdAt(1)).toBe(idBefore);
    expect(overlay.getSelectedPoint()).toBe(1);
    expect(overlay.getNestedPoints()).toEqual([
      [
        [0.3, 0.3],
        [0.4, 0.4],
      ],
    ]);
    expect(overlay.label.label).toBe("road");
  });

  // Regression (2026-09-30): the override still called the parent with the
  // old (worldPoint, variant, id) form after the parent moved to an options
  // object, so a given id (undo/redo re-adding a point) was dropped
  it("adds a point with the id and variant it is given", () => {
    const overlay = make([[[0.1, 0.1]]]);

    const id = overlay.addPoint(
      { x: 50, y: 50 },
      { id: "fixed-id", silent: true },
    );

    expect(id).toBe("fixed-id");
    expect(overlay.getPointIdAt(1)).toBe("fixed-id");
    expect(overlay.getNestedPoints()).toEqual([
      [
        [0.1, 0.1],
        [0.5, 0.5],
      ],
    ]);
  });

  it("re-segments when a label changes its segment layout", () => {
    const overlay = make([[[0.1, 0.1]]]);

    overlay.applyLabel(
      label([
        [[0.1, 0.1]],
        [
          [0.6, 0.6],
          [0.7, 0.7],
        ],
      ]),
    );

    expect(overlay.getSegmentCount()).toBe(2);
    expect(overlay.getNestedPoints()).toEqual([
      [[0.1, 0.1]],
      [
        [0.6, 0.6],
        [0.7, 0.7],
      ],
    ]);
  });
});
