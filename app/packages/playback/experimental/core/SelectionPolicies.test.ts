import { describe, expect, it } from "vitest";
import {
  exact,
  interpolate,
  latestAt,
  nearest,
  type TimedSample,
} from "./SelectionPolicies";

const samples: TimedSample<string>[] = [
  { time: 10, value: "a" },
  { time: 20, value: "b" },
  { time: 30, value: "c" },
  { time: 40, value: "d" },
  { time: 50, value: "e" },
];

describe("latestAt", () => {
  it("returns the value with largest time <= target", () => {
    expect(latestAt(samples, 25)).toBe("b");
    expect(latestAt(samples, 30)).toBe("c");
    expect(latestAt(samples, 50)).toBe("e");
    expect(latestAt(samples, 55)).toBe("e");
  });

  it("returns undefined when target is before all samples", () => {
    expect(latestAt(samples, 5)).toBeUndefined();
    expect(latestAt(samples, 9)).toBeUndefined();
  });

  it("returns exact match at boundary", () => {
    expect(latestAt(samples, 10)).toBe("a");
  });

  it("returns undefined for empty array", () => {
    expect(latestAt([], 10)).toBeUndefined();
  });
});

describe("nearest", () => {
  it("returns the value with minimum distance to target", () => {
    expect(nearest(samples, 12)).toBe("a"); // closer to 10
    expect(nearest(samples, 18)).toBe("b"); // closer to 20
    expect(nearest(samples, 25)).toBe("b"); // closer to 20 (tie-break earlier)
  });

  it("returns exact match", () => {
    expect(nearest(samples, 30)).toBe("c");
  });

  it("tie-breaks in favor of earlier sample", () => {
    // time 15 is equidistant from 10 and 20 → earlier wins
    expect(nearest(samples, 15)).toBe("a");
  });

  it("handles edges", () => {
    expect(nearest(samples, 0)).toBe("a");
    expect(nearest(samples, 100)).toBe("e");
  });

  it("returns undefined for empty array", () => {
    expect(nearest([], 10)).toBeUndefined();
  });

  it("handles single sample", () => {
    const single: TimedSample<string>[] = [{ time: 5, value: "x" }];
    expect(nearest(single, 0)).toBe("x");
    expect(nearest(single, 5)).toBe("x");
    expect(nearest(single, 100)).toBe("x");
  });
});

describe("exact", () => {
  it("returns value only on exact match", () => {
    expect(exact(samples, 10)).toBe("a");
    expect(exact(samples, 30)).toBe("c");
    expect(exact(samples, 50)).toBe("e");
  });

  it("returns undefined when no exact match", () => {
    expect(exact(samples, 15)).toBeUndefined();
    expect(exact(samples, 0)).toBeUndefined();
    expect(exact(samples, 100)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(exact([], 10)).toBeUndefined();
  });
});

describe("interpolate", () => {
  const numSamples: TimedSample<number>[] = [
    { time: 0, value: 0 },
    { time: 10, value: 100 },
    { time: 20, value: 200 },
  ];

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  it("returns exact value on exact match", () => {
    expect(interpolate(numSamples, 0, lerp)).toBe(0);
    expect(interpolate(numSamples, 10, lerp)).toBe(100);
    expect(interpolate(numSamples, 20, lerp)).toBe(200);
  });

  it("interpolates between neighbors", () => {
    expect(interpolate(numSamples, 5, lerp)).toBe(50);
    expect(interpolate(numSamples, 15, lerp)).toBe(150);
  });

  it("interpolates at arbitrary t values", () => {
    // time 3 → t = 3/10 = 0.3, value = 0 + (100-0)*0.3 = 30
    expect(interpolate(numSamples, 3, lerp)).toBe(30);
    // time 17 → t = 7/10 = 0.7, value = 100 + (200-100)*0.7 = 170
    expect(interpolate(numSamples, 17, lerp)).toBe(170);
  });

  it("clamps to first value when before all samples", () => {
    expect(interpolate(numSamples, -5, lerp)).toBe(0);
  });

  it("clamps to last value when after all samples", () => {
    expect(interpolate(numSamples, 25, lerp)).toBe(200);
  });

  it("returns undefined for empty array", () => {
    expect(interpolate([], 10, lerp)).toBeUndefined();
  });

  it("returns single value for single-element array", () => {
    const single: TimedSample<number>[] = [{ time: 5, value: 42 }];
    expect(interpolate(single, 0, lerp)).toBe(42);
    expect(interpolate(single, 5, lerp)).toBe(42);
    expect(interpolate(single, 10, lerp)).toBe(42);
  });
});
