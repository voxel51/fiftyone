// ---------------------------------------------------------------------------
// Waveform peaks for audio that is never fully in memory.
//
// `buildChannelPeakPyramids` needs the whole track at once, which is exactly
// what streaming exists to avoid. Peaks are a min/max fold, though, so they
// can be accumulated window by window and the samples discarded immediately
// after — the pyramid is the only thing retained.
//
// The size difference is the point: an hour of 48kHz stereo is ~1.4GB of
// float samples, but only ~5MB of LOD-0 peaks at 256 samples per peak.
//
// Buckets not yet visited stay empty rather than reading as silence, so the
// viewer can render "not loaded" differently from "quiet". A track played
// straight through fills left to right; seeking fills the visited regions.
// ---------------------------------------------------------------------------

import {
  DEFAULT_SAMPLES_PER_PEAK,
  type PeakLevel,
  type PeakPyramid,
} from "./peak-pyramid";

export interface IncrementalPeakOptions {
  readonly channels: number;
  readonly sampleRate: number;
  readonly totalFrames: number;
  readonly samplesPerPeak?: number;
}

export interface IncrementalPeakAccumulator {
  /**
   * Folds one window of interleaved PCM in at `startFrame`. Safe to call
   * out of order and to overlap previously written ranges — a re-read after
   * a seek overwrites rather than blends, so repeated playback of a region
   * cannot inflate its peaks.
   */
  add(interleaved: Float32Array, startFrame: number): void;
  /** True once any bucket has data — gates showing a waveform at all. */
  hasData(): boolean;
  /** Fraction of buckets filled, for a progress affordance. */
  coverage(): number;
  /** Snapshot with coarser levels reduced from LOD 0. */
  pyramids(): readonly PeakPyramid[];
}

/** Coarser levels, each halving the peak count, down to a single bucket. */
function reduceLevels(base: PeakLevel): PeakLevel[] {
  const levels: PeakLevel[] = [base];
  let current = base;
  while (current.min.length > 1) {
    const count = Math.ceil(current.min.length / 2);
    const min = new Float32Array(count);
    const max = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = i * 2;
      const b = Math.min(a + 1, current.min.length - 1);
      min[i] = Math.min(current.min[a], current.min[b]);
      max[i] = Math.max(current.max[a], current.max[b]);
    }
    current = { min, max };
    levels.push(current);
  }
  return levels;
}

export function createIncrementalPeaks({
  channels,
  sampleRate,
  totalFrames,
  samplesPerPeak = DEFAULT_SAMPLES_PER_PEAK,
}: IncrementalPeakOptions): IncrementalPeakAccumulator {
  const channelCount = Math.max(1, channels);
  const peakCount = Math.max(1, Math.ceil(totalFrames / samplesPerPeak));

  // One min/max pair per bucket per channel, allocated once.
  const mins = Array.from(
    { length: channelCount },
    () => new Float32Array(peakCount),
  );
  const maxs = Array.from(
    { length: channelCount },
    () => new Float32Array(peakCount),
  );
  // Tracked separately from the values: a bucket whose true peaks are 0 is
  // silence, which is not the same as a bucket never read.
  const filled = new Uint8Array(peakCount);
  let filledCount = 0;

  return {
    add(interleaved, startFrame) {
      const frames = Math.floor(interleaved.length / channelCount);
      if (frames <= 0) return;

      let bucket = Math.floor(startFrame / samplesPerPeak);
      let frame = 0;
      while (frame < frames && bucket < peakCount) {
        // Fold only up to this bucket's boundary, so a window that starts
        // mid-bucket does not smear into the next one.
        const bucketEndFrame = (bucket + 1) * samplesPerPeak - startFrame;
        const stop = Math.min(frames, bucketEndFrame);

        // A re-read overwrites: seed from the first frame rather than the
        // stored value, or replaying a region would widen its peaks forever.
        const fresh = filled[bucket] === 0;
        for (let channel = 0; channel < channelCount; channel++) {
          let lo = fresh ? Number.POSITIVE_INFINITY : mins[channel][bucket];
          let hi = fresh ? Number.NEGATIVE_INFINITY : maxs[channel][bucket];
          for (let f = frame; f < stop; f++) {
            const value = interleaved[f * channelCount + channel] ?? 0;
            if (value < lo) lo = value;
            if (value > hi) hi = value;
          }
          if (Number.isFinite(lo)) mins[channel][bucket] = lo;
          if (Number.isFinite(hi)) maxs[channel][bucket] = hi;
        }
        if (fresh && stop > frame) {
          filled[bucket] = 1;
          filledCount += 1;
        }
        frame = stop;
        bucket += 1;
      }
    },
    hasData: () => filledCount > 0,
    coverage: () => filledCount / peakCount,
    pyramids() {
      return mins.map((min, channel) => ({
        levels: reduceLevels({ min, max: maxs[channel] }),
        samplesPerPeak,
        sampleRate,
      }));
    },
  };
}
