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
  /**
   * Expected length, used to size the initial allocation. Treated as an
   * estimate, not a bound: audio that runs past it grows the buffers rather
   * than being dropped.
   */
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
  /**
   * Seconds of audio actually folded in so far, measured from the furthest
   * frame written — NOT from the `totalFrames` estimate. This is what makes
   * the decoded audio, rather than the recording's message timestamps, the
   * authority on how long a source is.
   */
  decodedDurationSec(): number;
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
  let peakCount = Math.max(1, Math.ceil(totalFrames / samplesPerPeak));
  /**
   * The horizontal extent the waveform represents. Fixed from the caller's
   * expected length, and only ever extended if real audio overruns it — so
   * the axis does not move as buffers are over-allocated or grown.
   */
  let axisFrames = Math.max(1, totalFrames);

  // One min/max pair per bucket per channel.
  let mins = Array.from(
    { length: channelCount },
    () => new Float32Array(peakCount),
  );
  let maxs = Array.from(
    { length: channelCount },
    () => new Float32Array(peakCount),
  );
  // Tracked separately from the values: a bucket whose true peaks are 0 is
  // silence, which is not the same as a bucket never read.
  let filled = new Uint8Array(peakCount);
  let filledCount = 0;
  /**
   * Frames folded into each bucket so far. A bucket is FROZEN once this
   * reaches `samplesPerPeak` — every sample it summarizes has been seen, so
   * nothing a later read could add is new.
   *
   * A plain filled/not-filled flag could not express this. Windows do not
   * align to bucket boundaries, so a bucket at a window edge was marked
   * filled after seeing only part of its samples; the next pass folded in
   * the rest and widened its peaks. Since display gain is derived from the
   * loudest peak across all rows, one widened bucket rescaled the entire
   * waveform — which is what made it shift every time playback looped.
   */
  let covered = new Uint16Array(peakCount);
  /** One past the furthest bucket written — the decoded extent. */
  let writtenBuckets = 0;

  /**
   * Grows to hold `needed` buckets.
   *
   * The initial size comes from a caller's estimate, and on the MCAP path
   * that estimate is the recording's message-timestamp span — which can be
   * shorter than the audio itself, since the last message carries samples
   * that continue past its own timestamp. Bounding writes by the estimate
   * silently truncated that tail; growing keeps the audio authoritative.
   */
  function ensureCapacity(needed: number): void {
    if (needed <= peakCount) return;
    // Over-allocate so a stream that overruns by a little does not copy on
    // every window.
    const next = Math.max(needed, Math.ceil(peakCount * 1.5));
    mins = mins.map((prev) => {
      const grown = new Float32Array(next);
      grown.set(prev);
      return grown;
    });
    maxs = maxs.map((prev) => {
      const grown = new Float32Array(next);
      grown.set(prev);
      return grown;
    });
    const grownFilled = new Uint8Array(next);
    grownFilled.set(filled);
    filled = grownFilled;
    const grownCovered = new Uint16Array(next);
    grownCovered.set(covered);
    covered = grownCovered;
    peakCount = next;
  }

  return {
    add(interleaved, startFrame) {
      const frames = Math.floor(interleaved.length / channelCount);
      if (frames <= 0) return;

      let bucket = Math.floor(startFrame / samplesPerPeak);
      const endBucket = Math.ceil((startFrame + frames) / samplesPerPeak);
      ensureCapacity(endBucket);
      // Furthest extent reached, so `decodedDurationSec` reports what the
      // audio actually covers rather than what was estimated for it.
      if (endBucket > writtenBuckets) writtenBuckets = endBucket;
      if (startFrame + frames > axisFrames) axisFrames = startFrame + frames;
      let frame = 0;
      while (frame < frames && bucket < peakCount) {
        // Fold only up to this bucket's boundary, so a window that starts
        // mid-bucket does not smear into the next one.
        const bucketEndFrame = (bucket + 1) * samplesPerPeak - startFrame;
        const stop = Math.min(frames, bucketEndFrame);

        // Complete buckets are frozen: skip rather than re-folding. Reading
        // the same audio again can only ever widen min/max, never correct
        // them, so a loop would keep nudging the picture.
        if (covered[bucket] >= samplesPerPeak) {
          frame = stop;
          bucket += 1;
          continue;
        }

        // Partial coverage within a bucket still folds — the remaining
        // frames arrive in the next window and are genuinely new.
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
        if (stop > frame) {
          if (fresh) {
            filled[bucket] = 1;
            filledCount += 1;
          }
          covered[bucket] = Math.min(
            samplesPerPeak,
            covered[bucket] + (stop - frame),
          );
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
        durationSec: axisFrames / Math.max(1, sampleRate),
      }));
    },
    decodedDurationSec() {
      return (writtenBuckets * samplesPerPeak) / Math.max(1, sampleRate);
    },
  };
}
