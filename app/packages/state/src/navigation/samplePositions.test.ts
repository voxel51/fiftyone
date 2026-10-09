/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { loadable } from "@fiftyone/reverb";
import { describe, expect, it } from "vitest";
import {
  EXACT_POSITION_LIMIT,
  exactTotal,
  trackPositions,
} from "./samplePositions";

describe("exactTotal", () => {
  it("is a settled exact count below the limit", () => {
    expect(exactTotal(loadable(40), false)).toBe(40);
  });

  it("is unknown for an estimate, a pending count, or no count", () => {
    expect(exactTotal(loadable(40), true)).toBeUndefined();
    expect(
      exactTotal(loadable(new Promise<number>(() => undefined)), false),
    ).toBeUndefined();
    expect(exactTotal(undefined, false)).toBeUndefined();
  });

  it("is unknown at and above the limit", () => {
    expect(exactTotal(loadable(EXACT_POSITION_LIMIT), false)).toBeUndefined();
    expect(exactTotal(loadable(EXACT_POSITION_LIMIT - 1), false)).toBe(
      EXACT_POSITION_LIMIT - 1,
    );
  });
});

describe("trackPositions", () => {
  it("places each sample stepped to relative to the last", () => {
    const { positions, stepped } = trackPositions(10, "a", 4);
    stepped("b", 1);
    stepped("c", -3);

    expect(positions.total).toBe(10);
    expect(["a", "b", "c", "d"].map(positions.offsetOf)).toEqual([
      4,
      5,
      2,
      undefined,
    ]);
  });
});
