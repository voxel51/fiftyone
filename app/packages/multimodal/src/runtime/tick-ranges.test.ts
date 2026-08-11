import { describe, expect, it } from "vitest";
import {
  clampTickRanges,
  intersectAllTickRanges,
  intersectTickRanges,
  normalizeTickRanges,
  subtractTickRanges,
  unionAllTickRanges,
} from "./tick-ranges";

describe("tick range algebra", () => {
  it("normalizes only discrete non-negative safe indexes", () => {
    expect(
      normalizeTickRanges([
        { endIndex: 4, startIndex: 3 },
        { endIndex: 2, startIndex: 1 },
        { endIndex: 4.5, startIndex: 4 },
        { endIndex: 0, startIndex: -1 },
        { endIndex: Number.MAX_SAFE_INTEGER + 1, startIndex: 5 },
      ]),
    ).toEqual([{ endIndex: 4, startIndex: 1 }]);
  });

  it("clamps to a validated finite timeline before normalization", () => {
    expect(
      clampTickRanges(
        [
          { endIndex: 3.8, startIndex: -2.2 },
          { endIndex: 9, startIndex: 8 },
        ],
        5,
      ),
    ).toEqual([{ endIndex: 3, startIndex: 0 }]);
    expect(() => clampTickRanges([], -1)).toThrow(RangeError);
    expect(() => clampTickRanges([], 1.5)).toThrow(RangeError);
  });

  it("intersects unsorted overlapping operands consistently", () => {
    expect(
      intersectTickRanges(
        [
          { endIndex: 7, startIndex: 5 },
          { endIndex: 3, startIndex: 1 },
          { endIndex: 5, startIndex: 3 },
        ],
        [
          { endIndex: 6, startIndex: 6 },
          { endIndex: 2, startIndex: 0 },
        ],
      ),
    ).toEqual([
      { endIndex: 2, startIndex: 1 },
      { endIndex: 6, startIndex: 6 },
    ]);
  });

  it("unions and intersects aggregate range sets", () => {
    expect(
      unionAllTickRanges([
        [{ endIndex: 2, startIndex: 0 }],
        [
          { endIndex: 6, startIndex: 5 },
          { endIndex: 4, startIndex: 2 },
        ],
      ]),
    ).toEqual([{ endIndex: 6, startIndex: 0 }]);

    expect(
      intersectAllTickRanges([
        [{ endIndex: 10, startIndex: 0 }],
        [
          { endIndex: 4, startIndex: 2 },
          { endIndex: 9, startIndex: 7 },
        ],
        [{ endIndex: 8, startIndex: 3 }],
      ]),
    ).toEqual([
      { endIndex: 4, startIndex: 3 },
      { endIndex: 8, startIndex: 7 },
    ]);
    expect(intersectAllTickRanges([])).toEqual([]);
  });

  it.each([
    {
      expected: [],
      name: "full removal",
      removed: [{ endIndex: 10, startIndex: 0 }],
    },
    {
      expected: [{ endIndex: 10, startIndex: 4 }],
      name: "prefix removal",
      removed: [{ endIndex: 3, startIndex: 0 }],
    },
    {
      expected: [{ endIndex: 6, startIndex: 0 }],
      name: "suffix removal",
      removed: [{ endIndex: 10, startIndex: 7 }],
    },
    {
      expected: [
        { endIndex: 3, startIndex: 0 },
        { endIndex: 10, startIndex: 7 },
      ],
      name: "split removal",
      removed: [{ endIndex: 6, startIndex: 4 }],
    },
    {
      expected: [
        { endIndex: 1, startIndex: 0 },
        { endIndex: 5, startIndex: 4 },
        { endIndex: 9, startIndex: 8 },
      ],
      name: "multiple cuts",
      removed: [
        { endIndex: 3, startIndex: 2 },
        { endIndex: 7, startIndex: 6 },
        { endIndex: 10, startIndex: 10 },
      ],
    },
  ])("subtracts inclusive boundaries for $name", ({ expected, removed }) => {
    expect(
      subtractTickRanges([{ endIndex: 10, startIndex: 0 }], removed),
    ).toEqual(expected);
  });
});
