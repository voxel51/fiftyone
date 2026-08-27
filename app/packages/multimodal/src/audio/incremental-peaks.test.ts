import { describe, expect, it } from "vitest";
import { createIncrementalPeaks } from "./incremental-peaks";
import { buildChannelPeakPyramids } from "./peak-pyramid";

const SAMPLE_RATE = 8000;

/** Deterministic waveform; no Math.random so failures reproduce. */
function signal(frames: number, channels: number): Float32Array {
  const out = new Float32Array(frames * channels);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      out[f * channels + c] = Math.sin((f * (c + 1)) / 37) * 0.8;
    }
  }
  return out;
}

describe("incremental peaks", () => {
  it("matches the one-shot build when fed in windows", () => {
    const channels = 2;
    const frames = 5000;
    const all = signal(frames, channels);

    const acc = createIncrementalPeaks({
      channels,
      sampleRate: SAMPLE_RATE,
      totalFrames: frames,
    });
    // Deliberately not a multiple of samplesPerPeak (256), so windows
    // straddle bucket boundaries — the case most likely to smear.
    const windowFrames = 333;
    for (let start = 0; start < frames; start += windowFrames) {
      const end = Math.min(frames, start + windowFrames);
      acc.add(all.subarray(start * channels, end * channels), start);
    }

    const incremental = acc.pyramids();
    const oneShot = buildChannelPeakPyramids(all, {
      channels,
      sampleRate: SAMPLE_RATE,
    });

    expect(incremental).toHaveLength(oneShot.length);
    for (let c = 0; c < oneShot.length; c++) {
      expect(Array.from(incremental[c].levels[0].min)).toEqual(
        Array.from(oneShot[c].levels[0].min),
      );
      expect(Array.from(incremental[c].levels[0].max)).toEqual(
        Array.from(oneShot[c].levels[0].max),
      );
    }
  });

  it("distinguishes an unread bucket from a silent one", () => {
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: 2560, // 10 buckets
    });
    expect(acc.hasData()).toBe(false);
    expect(acc.coverage()).toBe(0);

    acc.add(new Float32Array(256), 0); // genuinely silent, but read
    expect(acc.hasData()).toBe(true);
    expect(acc.coverage()).toBeCloseTo(0.1);
  });

  it("does not widen peaks when a region is replayed after a seek", () => {
    const channels = 1;
    const frames = 1024;
    const all = signal(frames, channels);

    const acc = createIncrementalPeaks({
      channels,
      sampleRate: SAMPLE_RATE,
      totalFrames: frames,
    });
    acc.add(all, 0);
    const first = Array.from(acc.pyramids()[0].levels[0].max);

    // Same audio again, as a seek back would produce.
    acc.add(all, 0);
    expect(Array.from(acc.pyramids()[0].levels[0].max)).toEqual(first);
  });

  it("does not widen peaks when windows straddle bucket boundaries", () => {
    // The replay test above feeds one window covering whole buckets, so a
    // re-read folds identical values in and cannot be seen to widen. Real
    // paging does not align to buckets: a bucket is completed across two
    // windows, and marking it filled after the first left the second pass
    // free to widen it. That is what made the waveform shift on every loop.
    const frames = 1024;
    const all = signal(frames, 1);
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: frames,
    });

    const WINDOW = 100; // deliberately coprime with the 256-frame bucket
    for (let start = 0; start < frames; start += WINDOW) {
      acc.add(all.slice(start, Math.min(start + WINDOW, frames)), start);
    }
    const first = Array.from(acc.pyramids()[0].levels[0].max);

    for (let start = 0; start < frames; start += WINDOW) {
      acc.add(all.slice(start, Math.min(start + WINDOW, frames)), start);
    }
    expect(Array.from(acc.pyramids()[0].levels[0].max)).toEqual(first);
  });

  it("holds its time axis steady as the buffer grows", () => {
    // The axis is the declared span, not the allocation. Deriving it from
    // the buffer's length meant every growth restretched it and slid the
    // waveform sideways while it filled.
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: SAMPLE_RATE,
    });
    acc.add(signal(256, 1), 0);
    expect(acc.pyramids()[0].durationSec).toBeCloseTo(1);

    acc.add(signal(SAMPLE_RATE, 1), 0);
    expect(acc.pyramids()[0].durationSec).toBeCloseTo(1);
  });

  it("extends its axis only when audio overruns the expected length", () => {
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: SAMPLE_RATE,
    });
    acc.add(signal(SAMPLE_RATE * 2, 1), 0);
    expect(acc.pyramids()[0].durationSec).toBeCloseTo(2);
  });

  it("returns the same instances once nothing new is being folded in", () => {
    // Callers poll this, and the GPU texture cache keys on pyramid identity
    // — a fresh object per poll rebuilt every level in JS and re-uploaded
    // every texture, four times a second, forever.
    const frames = 1024;
    const all = signal(frames, 1);
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: frames,
    });
    for (let start = 0; start < frames; start += 100) {
      acc.add(all.slice(start, Math.min(start + 100, frames)), start);
    }

    const first = acc.pyramids();
    expect(acc.pyramids()).toBe(first);

    // A full replay folds in nothing new, so still no new instances.
    for (let start = 0; start < frames; start += 100) {
      acc.add(all.slice(start, Math.min(start + 100, frames)), start);
    }
    expect(acc.pyramids()).toBe(first);
  });

  it("still produces new instances while genuinely filling", () => {
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: 4096,
    });
    acc.add(signal(256, 1), 0);
    const first = acc.pyramids();
    acc.add(signal(256, 1), 1024);
    expect(acc.pyramids()).not.toBe(first);
  });

  it("keeps peak count and duration describing the same span", () => {
    // Consumers size their texture from `levels[0].min.length` and map time
    // across `durationSec`. If the buffer is over-allocated and handed out
    // raw, the texture covers more time than the duration claims and the
    // drawing is squeezed into `declared / capacity` of the width.
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: SAMPLE_RATE,
    });
    // Overrun the estimate, which triggers the 1.5x growth.
    acc.add(signal(SAMPLE_RATE + 1000, 1), 0);

    const pyramid = acc.pyramids()[0];
    const impliedSec =
      (pyramid.levels[0].min.length * pyramid.samplesPerPeak) /
      pyramid.sampleRate;
    expect(impliedSec).toBeCloseTo(pyramid.durationSec, 1);
  });

  it("fills only the region visited when playback starts mid-track", () => {
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: 2560, // 10 buckets
    });
    acc.add(new Float32Array(512).fill(0.5), 1280); // buckets 5 and 6
    expect(acc.coverage()).toBeCloseTo(0.2);
    const level0 = acc.pyramids()[0].levels[0];
    expect(level0.max[5]).toBeCloseTo(0.5);
    expect(level0.max[0]).toBe(0); // never read
  });

  it("reduces coarser levels down to a single bucket", () => {
    const acc = createIncrementalPeaks({
      channels: 1,
      sampleRate: SAMPLE_RATE,
      totalFrames: 256 * 8,
    });
    acc.add(signal(256 * 8, 1), 0);
    const levels = acc.pyramids()[0].levels;
    expect(levels[0].min).toHaveLength(8);
    expect(levels.at(-1)?.min).toHaveLength(1);
  });
});
