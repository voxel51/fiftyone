import { describe, expect, it } from "vitest";
import { frameAt, resolveAtTime } from "./utils";

const NEAREST = { type: "nearest" as const, thresholdSeconds: 0.1 };
const NEAREST_PREVIOUS = {
  type: "nearestPrevious" as const,
  thresholdSeconds: 0.1,
};

describe("resolveAtTime", () => {
  it("returns null when the cache is empty", () => {
    expect(resolveAtTime(new Map(), 1, NEAREST)).toBeNull();
  });

  it("returns the entry exactly at the requested time", () => {
    const cache = new Map([
      [0, "a"],
      [1, "b"],
      [2, "c"],
    ]);
    expect(resolveAtTime(cache, 1, NEAREST)).toBe("b");
  });

  it("returns the closest entry within the threshold (nearest)", () => {
    const cache = new Map([
      [0, "a"],
      [1, "b"],
      [2, "c"],
    ]);
    // 0.95 → nearest is 1 (dist 0.05) within threshold 0.1.
    expect(resolveAtTime(cache, 0.95, NEAREST)).toBe("b");
  });

  it("returns null when no entry is within the threshold", () => {
    const cache = new Map([
      [0, "a"],
      [5, "b"],
    ]);
    expect(resolveAtTime(cache, 1, NEAREST)).toBeNull();
  });

  it("breaks ties consistently when two entries are equidistant", () => {
    const cache = new Map([
      [0.95, "lo"],
      [1.05, "hi"],
    ]);
    // Both at distance 0.05. Assert deterministic — repeated calls
    // must return the same winner, not "either is fine".
    const first = resolveAtTime(cache, 1, NEAREST);
    expect(first).not.toBeNull();
    for (let i = 0; i < 8; i++) {
      expect(resolveAtTime(cache, 1, NEAREST)).toBe(first);
    }
  });

  it("returns null when the only entry is just past the threshold", () => {
    const cache = new Map([[1.2, "too-far"]]);
    // Distance 0.2 > 0.1 threshold.
    expect(resolveAtTime(cache, 1.0, NEAREST)).toBeNull();
  });

  it("ignores entries strictly after the time when policy is nearestPrevious", () => {
    const cache = new Map([
      [0.5, "before"],
      [1.5, "after"],
    ]);
    // Both within 0.5s — but "after" is past `time` and should be skipped.
    expect(
      resolveAtTime(cache, 1, { ...NEAREST_PREVIOUS, thresholdSeconds: 0.5 })
    ).toBe("before");
  });

  it("returns null for nearestPrevious when only future entries exist", () => {
    const cache = new Map([
      [1.1, "future-a"],
      [2, "future-b"],
    ]);
    expect(resolveAtTime(cache, 1, NEAREST_PREVIOUS)).toBeNull();
  });

  it("picks the best (closest) of multiple eligible past entries", () => {
    const cache = new Map([
      [0.5, "older"],
      [0.9, "newer"],
    ]);
    expect(
      resolveAtTime(cache, 1, { ...NEAREST_PREVIOUS, thresholdSeconds: 1 })
    ).toBe("newer");
  });

  it("handles non-string value types (objects, numbers)", () => {
    const cache = new Map<number, { tag: string }>([
      [0, { tag: "zero" }],
      [1, { tag: "one" }],
    ]);
    expect(resolveAtTime(cache, 1, NEAREST)).toEqual({ tag: "one" });
  });

  it("returns the entry when within the threshold (sub-threshold distance)", () => {
    const cache = new Map([[1, "v"]]);
    // |1.05 - 1| = 0.05 < 0.1 threshold → hit.
    expect(resolveAtTime(cache, 1.05, NEAREST)).toBe("v");
  });
});

describe("frameAt", () => {
  it("returns 1 at time 0 (1-indexed)", () => {
    expect(frameAt(0, 30)).toBe(1);
  });

  it("floors to the nearest preceding frame boundary", () => {
    // 1/30s exactly → frame 2; just under → still frame 1.
    expect(frameAt(1 / 30, 30)).toBe(2);
    expect(frameAt(1 / 30 - 1e-9, 30)).toBe(1);
  });

  it("returns the raw frame when no frameCount is provided", () => {
    // 100s @ 30fps → 3001 — no clamping without an upper bound.
    expect(frameAt(100, 30)).toBe(3001);
  });

  it("clamps to [1, frameCount] when frameCount is provided", () => {
    expect(frameAt(-1, 30, 100)).toBe(1);
    expect(frameAt(1000, 30, 100)).toBe(100);
    expect(frameAt(1, 30, 100)).toBe(31);
  });
});
