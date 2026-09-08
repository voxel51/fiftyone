import { describe, expect, it } from "vitest";
import {
  buildChannelPeakPyramids,
  buildPeakPyramid,
  chooseLod,
  synthesizePeaks,
} from "./peak-pyramid";

describe("buildPeakPyramid", () => {
  it("summarizes samples into min/max buckets at the finest level", () => {
    const samples = new Float32Array([0, 1, -1, 0.5, -0.5, 0.2]);
    const pyramid = buildPeakPyramid(samples, {
      samplesPerPeak: 3,
      sampleRate: 100,
    });
    expect(pyramid.levels[0].min).toEqual(new Float32Array([-1, -0.5]));
    expect(pyramid.levels[0].max).toEqual(new Float32Array([1, 0.5]));
  });

  it("builds coarser levels by min/max-of-min/max over pairs", () => {
    const samples = new Float32Array([0, 1, 0, -1, 0, 2, 0, -2]);
    const pyramid = buildPeakPyramid(samples, {
      samplesPerPeak: 2,
      sampleRate: 100,
    });
    // level 0: 4 peaks -> [0,1],[−1,0],[0,2],[−2,0]
    expect(pyramid.levels[0].min).toEqual(new Float32Array([0, -1, 0, -2]));
    expect(pyramid.levels[0].max).toEqual(new Float32Array([1, 0, 2, 0]));
    // level 1: pairs of level 0 -> min(0,-1)=-1,max(1,0)=1 ; min(0,-2)=-2,max(2,0)=2
    expect(pyramid.levels[1].min).toEqual(new Float32Array([-1, -2]));
    expect(pyramid.levels[1].max).toEqual(new Float32Array([1, 2]));
    // level 2: single peak collapsing the two level-1 peaks
    expect(pyramid.levels[2].min).toEqual(new Float32Array([-2]));
    expect(pyramid.levels[2].max).toEqual(new Float32Array([2]));
    // pyramid stops once a level has a single peak
    expect(pyramid.levels).toHaveLength(3);
  });

  it("collapses an empty bucket to silence instead of +/-Infinity", () => {
    const pyramid = buildPeakPyramid(new Float32Array([]), {
      samplesPerPeak: 4,
      sampleRate: 100,
    });
    expect(pyramid.levels[0].min[0]).toBe(0);
    expect(pyramid.levels[0].max[0]).toBe(0);
  });

  it("defaults to DEFAULT_SAMPLES_PER_PEAK when unspecified", () => {
    const samples = new Float32Array(1000).fill(0.5);
    const pyramid = buildPeakPyramid(samples, { sampleRate: 48_000 });
    expect(pyramid.samplesPerPeak).toBe(256);
    expect(pyramid.levels[0].min.length).toBe(Math.ceil(1000 / 256));
  });
});

describe("chooseLod", () => {
  it("picks LOD 0 when zoomed in enough that even the finest level is coarser than a pixel", () => {
    const pyramid = buildPeakPyramid(new Float32Array(100), {
      samplesPerPeak: 1,
      sampleRate: 100,
    });
    const lod = chooseLod(pyramid, { viewDurationSec: 0.01, pixelWidth: 800 });
    expect(lod).toBe(0);
  });

  it("picks a coarser LOD when zoomed out enough that LOD 0 would exceed one peak per pixel", () => {
    const samples = new Float32Array(100_000);
    const pyramid = buildPeakPyramid(samples, {
      samplesPerPeak: 1,
      sampleRate: 100_000,
    });
    const lod = chooseLod(pyramid, { viewDurationSec: 1, pixelWidth: 100 });
    expect(lod).toBeGreaterThan(0);
    // never exceeds the pyramid's own depth
    expect(lod).toBeLessThan(pyramid.levels.length);
  });

  it("returns 0 for a degenerate view (zero width or duration)", () => {
    const pyramid = buildPeakPyramid(new Float32Array(10), {
      samplesPerPeak: 1,
      sampleRate: 100,
    });
    expect(chooseLod(pyramid, { viewDurationSec: 0, pixelWidth: 800 })).toBe(0);
    expect(chooseLod(pyramid, { viewDurationSec: 1, pixelWidth: 0 })).toBe(0);
  });
});

describe("synthesizePeaks", () => {
  it("produces a pyramid covering the requested duration", () => {
    const pyramid = synthesizePeaks({ durationSec: 2, sampleRate: 1000 });
    const totalSamples = pyramid.levels[0].min.length * pyramid.samplesPerPeak;
    expect(totalSamples).toBeGreaterThanOrEqual(2000);
    expect(totalSamples).toBeLessThan(2000 + pyramid.samplesPerPeak);
  });

  it("stays within [-1, 1] like real normalized PCM", () => {
    const pyramid = synthesizePeaks({ durationSec: 1, sampleRate: 1000 });
    for (const level of pyramid.levels) {
      for (const v of level.min) expect(v).toBeGreaterThanOrEqual(-1);
      for (const v of level.max) expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildChannelPeakPyramids", () => {
  it("splits an interleaved stereo buffer into one pyramid per channel", () => {
    // L is a constant +0.5, R a constant -0.5. Summarizing the interleaved
    // buffer directly would put both into every bucket, so each channel's
    // min/max proves the deinterleave arithmetic.
    const frames = 512;
    const interleaved = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      interleaved[i * 2] = 0.5;
      interleaved[i * 2 + 1] = -0.5;
    }

    const [left, right] = buildChannelPeakPyramids(interleaved, {
      channels: 2,
      sampleRate: 48_000,
    });

    expect(left.levels[0].min[0]).toBeCloseTo(0.5);
    expect(left.levels[0].max[0]).toBeCloseTo(0.5);
    expect(right.levels[0].min[0]).toBeCloseTo(-0.5);
    expect(right.levels[0].max[0]).toBeCloseTo(-0.5);
  });

  it("returns a single pyramid for mono without copying", () => {
    const samples = Float32Array.from({ length: 64 }, (_, i) => i / 64);
    const pyramids = buildChannelPeakPyramids(samples, {
      channels: 1,
      sampleRate: 8000,
    });
    expect(pyramids).toHaveLength(1);
  });
});
