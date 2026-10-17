import { describe, expect, it } from "vitest";
import {
  heldStateCode,
  reserveStateLaneBand,
  stateLaneLayout,
  stateSegments,
} from "./state-lanes";

describe("stateLaneLayout", () => {
  it("stacks standalone lanes from the top at a reading height", () => {
    expect(stateLaneLayout(300, 2, false)).toEqual({
      laneHeightPx: 32,
      laneTopsPx: [4, 40],
      reservedPx: 0,
    });
  });

  it("bands lanes along the bottom beside lines and reserves their room", () => {
    expect(stateLaneLayout(200, 2, true)).toEqual({
      laneHeightPx: 20,
      laneTopsPx: [152, 176],
      reservedPx: 52,
    });
  });

  it("caps the lane band at half of a short plot", () => {
    const layout = stateLaneLayout(80, 3, true);

    expect(layout.laneHeightPx).toBe(9);
    expect(layout.reservedPx).toBeLessThanOrEqual(80 / 2 + 4);
  });
});

describe("reserveStateLaneBand", () => {
  it("extends the minimum so lines fill only the plot above the band", () => {
    const [min, max] = reserveStateLaneBand([0, 10], 200, 50);

    expect(max).toBe(10);
    // 150px of lines span 10 units, so the 50px band spans 10/3 more.
    expect(min).toBeCloseTo(-10 / 3, 9);
  });

  it("leaves the range alone without a band or a measured plot", () => {
    expect(reserveStateLaneBand([0, 10], 200, 0)).toEqual([0, 10]);
    expect(reserveStateLaneBand([0, 10], 0, 50)).toEqual([0, 10]);
  });
});

describe("stateSegments", () => {
  it("holds each state until the next transition and merges repeats", () => {
    const segments = stateSegments(
      [0, 1, 2, 3, 4, 5],
      [0, undefined, 0, 1, undefined, 1],
      () => 9,
    );

    expect(segments).toEqual([
      { code: 0, endSec: 3, startSec: 0 },
      { code: 1, endSec: 9, startSec: 3 },
    ]);
  });

  it("ends the held state at a gap and resumes at the next sample", () => {
    const segments = stateSegments(
      [0, 1, 2, 3],
      [2, null, undefined, 2],
      () => Number.NEGATIVE_INFINITY,
    );

    expect(segments).toEqual([
      { code: 2, endSec: 1, startSec: 0 },
      { code: 2, endSec: 3, startSec: 3 },
    ]);
  });
});

describe("heldStateCode", () => {
  it("reads the nearest real sample at or before an index", () => {
    const column = [undefined, 1, undefined, null, undefined];

    expect(heldStateCode(column, 0)).toBeNull();
    expect(heldStateCode(column, 2)).toBe(1);
    expect(heldStateCode(column, 4)).toBeNull();
  });
});
