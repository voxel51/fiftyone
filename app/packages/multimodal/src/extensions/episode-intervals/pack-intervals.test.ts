import { describe, expect, it } from "vitest";
import { packIntervals, UNPLACED } from "./pack-intervals";

const span = (start: number, end: number) => ({ start, end });

describe("packIntervals", () => {
  it("keeps disjoint intervals on one level", () => {
    const { levels, levelCount } = packIntervals(
      [span(0, 10), span(10, 20), span(30, 40)],
      3,
    );

    expect(levels).toEqual([0, 0, 0]);
    expect(levelCount).toBe(1);
  });

  it("treats an interval starting exactly where the last ended as free", () => {
    // The level is free when its recorded end is <= the next start, so
    // back-to-back intervals share a level rather than stacking.
    const { levels, levelCount } = packIntervals([span(0, 5), span(5, 9)], 3);

    expect(levels).toEqual([0, 0]);
    expect(levelCount).toBe(1);
  });

  it("stacks overlapping intervals onto successive levels", () => {
    const { levels, levelCount } = packIntervals(
      [span(0, 30), span(5, 30), span(10, 30)],
      3,
    );

    expect(levels).toEqual([0, 1, 2]);
    expect(levelCount).toBe(3);
  });

  it("leaves a fourth concurrent interval unplaced rather than stacking it", () => {
    // The regression this guards: assigning the overflow to the top level drew
    // it over the interval already there, which reads as a mark floating loose.
    const { levels, levelCount } = packIntervals(
      [span(0, 30), span(1, 30), span(2, 30), span(3, 30), span(4, 30)],
      3,
    );

    expect(levels).toEqual([0, 1, 2, UNPLACED, UNPLACED]);
    expect(levelCount).toBe(3);
  });

  it("reuses a level freed by an earlier interval ending", () => {
    const { levels } = packIntervals(
      [span(0, 10), span(0, 30), span(15, 25)],
      3,
    );

    // The third starts after the first ended, so it takes level 0 back rather
    // than opening a third level.
    expect(levels).toEqual([0, 1, 0]);
  });

  it("assigns levels in input order regardless of input ordering", () => {
    // Packing walks earliest-first, but results are reported per input index.
    const { levels } = packIntervals([span(10, 40), span(0, 30)], 3);

    expect(levels).toEqual([1, 0]);
  });

  it("breaks equal starts by the earlier end", () => {
    const { levels } = packIntervals([span(0, 40), span(0, 10)], 3);

    expect(levels).toEqual([1, 0]);
  });

  it("stacks two instants at the same moment on separate levels", () => {
    // An instant is drawn at a minimum width rather than its true zero width,
    // so two sharing a level would paint over each other and read as one.
    const { levels, levelCount } = packIntervals(
      [span(10, 10), span(10, 10)],
      3,
    );

    expect(levels).toEqual([0, 1]);
    expect(levelCount).toBe(2);
  });

  it("does not let an instant share the boundary of the span before it", () => {
    const { levels } = packIntervals([span(0, 10), span(10, 10)], 3);

    expect(levels).toEqual([0, 1]);
  });

  it("does not let a span start on an instant's boundary", () => {
    const { levels } = packIntervals([span(10, 10), span(10, 20)], 3);

    expect(levels).toEqual([0, 1]);
  });

  it("still shares a level between two back-to-back spans", () => {
    // The boundary case that must keep working: neither side is an instant, so
    // they read as one continuous run.
    const { levels, levelCount } = packIntervals([span(0, 5), span(5, 9)], 3);

    expect(levels).toEqual([0, 0]);
    expect(levelCount).toBe(1);
  });

  it("reports one level for an empty input", () => {
    const { levels, levelCount } = packIntervals([], 3);

    expect(levels).toEqual([]);
    expect(levelCount).toBe(1);
  });

  it("honours a cap of one", () => {
    const { levels, levelCount } = packIntervals([span(0, 10), span(1, 10)], 1);

    expect(levels).toEqual([0, UNPLACED]);
    expect(levelCount).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a cap of %p",
    (maxLevels) => {
      expect(() => packIntervals([span(0, 1)], maxLevels)).toThrow(RangeError);
    },
  );
});
