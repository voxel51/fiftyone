/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, test } from "vitest";
import {
  clampPointToFrame,
  clipPolylineToFrame,
  clipRectToFrame,
} from "./clipToFrame";

describe("clipRectToFrame", () => {
  test("returns a rect inside the frame unchanged", () => {
    const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(clipRectToFrame(rect)).toBe(rect);
  });

  test("clips a rect crossing the frame edges", () => {
    expect(
      clipRectToFrame({ x: -0.25, y: 0.5, width: 0.5, height: 0.75 }),
    ).toEqual({ x: 0, y: 0.5, width: 0.25, height: 0.5 });
  });

  test("returns null for a rect wholly outside the frame", () => {
    expect(
      clipRectToFrame({ x: 1.25, y: 0.5, width: 0.5, height: 0.25 }),
    ).toBeNull();
  });
});

describe("clampPointToFrame", () => {
  test("clamps each coordinate into the frame", () => {
    expect(clampPointToFrame([-0.5, 1.5])).toEqual([0, 1]);
  });

  test("keeps missing points missing", () => {
    expect(clampPointToFrame([NaN, NaN])).toEqual([NaN, NaN]);
  });
});

describe("clipPolylineToFrame", () => {
  test("returns shapes inside the frame unchanged", () => {
    const shapes: [number, number][][] = [
      [
        [0.25, 0.25],
        [0.75, 0.75],
      ],
    ];
    expect(clipPolylineToFrame(shapes, false)).toEqual(shapes);
  });

  test("cuts an open path at the frame edge", () => {
    expect(
      clipPolylineToFrame(
        [
          [
            [0.5, 0.5],
            [1.5, 0.5],
          ],
        ],
        false,
      ),
    ).toEqual([
      [
        [0.5, 0.5],
        [1, 0.5],
      ],
    ]);
  });

  test("keeps an open path whole when inside vertices don't round-trip", () => {
    expect(
      clipPolylineToFrame(
        [
          [
            [-0.2, 0.5],
            [0.1, 0.5],
            [0.3, 0.5],
            [0.7, 0.4],
            [0.9, 0.9],
          ],
        ],
        false,
      ),
    ).toEqual([
      [
        [0, 0.5],
        [0.1, 0.5],
        [0.3, 0.5],
        [0.7, 0.4],
        [0.9, 0.9],
      ],
    ]);
  });

  test("splits an open path that leaves and re-enters the frame", () => {
    expect(
      clipPolylineToFrame(
        [
          [
            [0.5, 0.25],
            [1.5, 0.25],
            [1.5, 0.75],
            [0.5, 0.75],
          ],
        ],
        false,
      ),
    ).toEqual([
      [
        [0.5, 0.25],
        [1, 0.25],
      ],
      [
        [1, 0.75],
        [0.5, 0.75],
      ],
    ]);
  });

  test("clips a closed shape to the frame's edge", () => {
    expect(
      clipPolylineToFrame(
        [
          [
            [0.5, 0.25],
            [1.5, 0.25],
            [1.5, 0.75],
            [0.5, 0.75],
          ],
        ],
        true,
      ),
    ).toEqual([
      [
        [0.5, 0.25],
        [1, 0.25],
        [1, 0.75],
        [0.5, 0.75],
      ],
    ]);
  });

  test("drops shapes wholly outside the frame", () => {
    const outside: [number, number][] = [
      [1.25, 0.25],
      [1.5, 0.5],
      [1.25, 0.75],
    ];
    expect(clipPolylineToFrame([outside], true)).toEqual([]);
    expect(clipPolylineToFrame([outside], false)).toEqual([]);
  });
});
