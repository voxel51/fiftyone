/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { FrameByteBudget } from "./frameByteBudget";

const MB = 1024 * 1024;

/** The bitmap-stream shape: a resident-pixel budget, one claim at a time. */
const pixels = (budgetBytes = 1e9, chunkFrames = 60) =>
  new FrameByteBudget({ budgetBytes, chunkFrames, frameCount: 1000 });

/** The label-stream shape: an in-flight budget with a floor and concurrency. */
const labels = () =>
  new FrameByteBudget({
    budgetBytes: 24 * MB,
    chunkFrames: 60,
    frameCount: 1000,
    minChunkFrames: 4,
    maxConcurrency: 4,
  });

describe("FrameByteBudget before a measurement", () => {
  it("leaves the configured sizing alone", () => {
    const budget = labels();
    expect(budget.bytesPerFrame).toBeUndefined();
    expect(budget.windowFrames()).toBe(Number.POSITIVE_INFINITY);
    expect(budget.chunkFrames()).toBe(60);
    expect(budget.concurrency()).toBe(4);
  });

  it("ignores measurements that measure nothing", () => {
    const budget = pixels();
    budget.observe(0);
    budget.observe(Number.NaN);
    budget.observeTotal(1000, 0);
    expect(budget.bytesPerFrame).toBeUndefined();
  });
});

describe("FrameByteBudget with large frames", () => {
  it("bounds the window and the chunk by the budget", () => {
    // A 1920x1200 decoded frame is 9.2MB, so a 1GB budget holds 108 and half
    // of that is what may be held ahead of the playhead.
    const budget = pixels();
    budget.observe(1920 * 1200 * 4);

    expect(budget.windowFrames()).toBe(54);
    expect(budget.chunkFrames()).toBe(54);
    expect(budget.chunkLengthAt(1)).toBe(54);
  });

  it("holds a frame costlier than the budget one at a time", () => {
    const budget = pixels(4 * MB);
    budget.observe(9 * MB);

    expect(budget.windowFrames()).toBe(1);
    expect(budget.chunkFrames()).toBe(1);
    expect(budget.concurrency()).toBe(1);
  });
});

describe("FrameByteBudget with small frames", () => {
  it("changes nothing a source can already afford", () => {
    const budget = pixels();
    budget.observe(640 * 480 * 4);

    expect(budget.windowFrames()).toBeGreaterThan(60);
    expect(budget.chunkFrames()).toBe(60);
    expect(budget.concurrency()).toBe(1);
  });
});

describe("FrameByteBudget for label payloads", () => {
  it("shrinks chunk and concurrency for float32 heatmaps", () => {
    const budget = labels();
    // ~2.4MB per frame: half the 24MB budget affords five in flight, split
    // into chunks so a fetch overlaps a decode, and floored at four.
    budget.observeTotal(60 * 2.4 * MB, 60);

    expect(budget.windowFrames()).toBe(5);
    expect(budget.chunkFrames()).toBe(4);
    expect(budget.concurrency()).toBe(2);
  });

  it("keeps the full chunk for uint8 masks", () => {
    const budget = labels();
    budget.observeTotal(60 * 6 * 1024, 60);

    expect(budget.chunkFrames()).toBe(60);
    expect(budget.concurrency()).toBe(4);
  });

  it("never shrinks below the minimum chunk", () => {
    const budget = labels();
    budget.observe(24 * MB);

    expect(budget.windowFrames()).toBe(1);
    expect(budget.chunkFrames()).toBe(4);
  });

  it("re-sizes when a heavy field is activated, latest measurement winning", () => {
    const budget = labels();
    budget.observeTotal(60 * 6 * 1024, 60);
    expect(budget.chunkFrames()).toBe(60);

    budget.observeTotal(60 * 2.4 * MB, 60);
    expect(budget.chunkFrames()).toBe(4);

    budget.observeTotal(60 * 6 * 1024, 60);
    expect(budget.chunkFrames()).toBe(60);
  });
});

describe("FrameByteBudget chunk lengths", () => {
  it("clamps to the end of the clip and reports nothing past it", () => {
    const budget = new FrameByteBudget({
      budgetBytes: 1e9,
      chunkFrames: 60,
      frameCount: 100,
    });

    expect(budget.chunkLengthAt(51)).toBe(50);
    expect(budget.chunkLengthAt(100)).toBe(1);
    expect(budget.chunkLengthAt(101)).toBe(0);
  });
});
