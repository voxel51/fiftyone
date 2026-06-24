import { describe, expect, it } from "vitest";
import {
  coalesce,
  mergePresence,
  removeFrames,
  type Segment,
} from "./segments";

describe("removeFrames", () => {
  it("returns a copy when nothing is removed", () => {
    const segments: Segment[] = [[1, 5]];
    expect(removeFrames(segments, [])).toEqual([[1, 5]]);
  });

  it("splits a run around an interior frame", () => {
    expect(removeFrames([[1, 10]], [4])).toEqual([
      [1, 3],
      [5, 10],
    ]);
  });

  it("trims at the edges", () => {
    expect(removeFrames([[1, 10]], [1, 10])).toEqual([[2, 9]]);
  });

  it("ignores frames outside every run", () => {
    expect(removeFrames([[3, 5]], [1, 2, 9])).toEqual([[3, 5]]);
  });

  it("removes a single-frame run entirely", () => {
    expect(removeFrames([[4, 4]], [4])).toEqual([]);
  });

  it("handles multiple removals across multiple runs", () => {
    expect(
      removeFrames(
        [
          [1, 5],
          [8, 12],
        ],
        [2, 4, 10]
      )
    ).toEqual([
      [1, 1],
      [3, 3],
      [5, 5],
      [8, 9],
      [11, 12],
    ]);
  });
});

describe("coalesce", () => {
  it("merges adjacent runs that touch by one frame", () => {
    expect(
      coalesce([
        [1, 3],
        [4, 6],
      ])
    ).toEqual([[1, 6]]);
  });

  it("merges overlapping runs", () => {
    expect(
      coalesce([
        [1, 5],
        [3, 8],
      ])
    ).toEqual([[1, 8]]);
  });

  it("keeps a genuine gap", () => {
    expect(
      coalesce([
        [1, 3],
        [5, 6],
      ])
    ).toEqual([
      [1, 3],
      [5, 6],
    ]);
  });

  it("sorts before merging", () => {
    expect(
      coalesce([
        [5, 6],
        [1, 3],
        [4, 4],
      ])
    ).toEqual([[1, 6]]);
  });
});

describe("mergePresence", () => {
  it("is the identity when no frames are dirty", () => {
    expect(mergePresence([[1, 10]], [], [])).toEqual([[1, 10]]);
  });

  it("drops a dirty frame the overlay no longer has (deletion)", () => {
    expect(mergePresence([[1, 10]], [5], [])).toEqual([
      [1, 4],
      [6, 10],
    ]);
  });

  it("re-adds a dirty frame the overlay still has (untouched presence)", () => {
    expect(mergePresence([[1, 10]], [5], [5])).toEqual([[1, 10]]);
  });

  it("extends presence onto a fresh dirty frame", () => {
    expect(mergePresence([[1, 5]], [6], [6])).toEqual([[1, 6]]);
  });

  it("builds presence entirely from the overlay for a new track", () => {
    expect(mergePresence([], [3, 4, 5], [3, 4, 5])).toEqual([[3, 5]]);
  });
});
