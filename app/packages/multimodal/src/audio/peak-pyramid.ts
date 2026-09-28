// ---------------------------------------------------------------------------
// Min/max peak pyramid for waveform rendering. Raw PCM samples are far
// denser than any display can show, so the GPU renderer never touches
// them directly — it samples a mipmap-style pyramid of min/max pairs
// instead, computed once at decode time (or synthesized for
// stories/tests) and cached.
//
// LOD 0 is the finest level (each peak summarizes `samplesPerPeak` raw
// samples); each coarser LOD halves the peak count by taking min/max over
// adjacent pairs of the previous level. Zooming out never re-touches raw
// PCM — it just selects a coarser LOD row.
// ---------------------------------------------------------------------------

/** One down-sampling level: `min[i]`/`max[i]` summarize samples `[i * stride, (i+1) * stride)`. */
export interface PeakLevel {
  readonly min: Float32Array;
  readonly max: Float32Array;
}

/** A full pyramid for one (track, channel) pair, finest level first. */
export interface PeakPyramid {
  readonly levels: readonly PeakLevel[];
  /** Raw samples summarized by LOD 0's `samplesPerPeak`. */
  readonly samplesPerPeak: number;
  readonly sampleRate: number;
  /**
   * Seconds of audio this pyramid's horizontal extent represents.
   *
   * Carried explicitly rather than derived from `levels[0].min.length`,
   * because buffer length is capacity and capacity is not time. A
   * progressively-filled pyramid over-allocates and can grow, and deriving
   * the time axis from its array length meant every growth restretched the
   * axis and slid the whole waveform sideways.
   */
  readonly durationSec: number;
}

/** Default bucket size for the finest LOD — see plan §6/§8. */
export const DEFAULT_SAMPLES_PER_PEAK = 256;

function finestLevel(samples: Float32Array, samplesPerPeak: number): PeakLevel {
  const peakCount = Math.max(1, Math.ceil(samples.length / samplesPerPeak));
  const min = new Float32Array(peakCount);
  const max = new Float32Array(peakCount);
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, samples.length);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let j = start; j < end; j++) {
      const v = samples[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    // An empty bucket (samples.length === 0) has no real value — collapse
    // to silence rather than leaving +/-Infinity for a texture upload.
    min[i] = Number.isFinite(lo) ? lo : 0;
    max[i] = Number.isFinite(hi) ? hi : 0;
  }
  return { min, max };
}

function coarserLevel(level: PeakLevel): PeakLevel {
  const peakCount = Math.max(1, Math.ceil(level.min.length / 2));
  const min = new Float32Array(peakCount);
  const max = new Float32Array(peakCount);
  for (let i = 0; i < peakCount; i++) {
    const a = i * 2;
    const b = a + 1;
    min[i] =
      b < level.min.length
        ? Math.min(level.min[a], level.min[b])
        : level.min[a];
    max[i] =
      b < level.max.length
        ? Math.max(level.max[a], level.max[b])
        : level.max[a];
  }
  return { min, max };
}

/**
 * Builds a full min/max pyramid from raw PCM samples for one channel.
 * Coarser levels are derived from the previous level (never from raw
 * samples again), stopping once a level would collapse to a single peak.
 */
export function buildPeakPyramid(
  samples: Float32Array,
  options: { samplesPerPeak?: number; sampleRate: number },
): PeakPyramid {
  const samplesPerPeak = options.samplesPerPeak ?? DEFAULT_SAMPLES_PER_PEAK;
  const levels: PeakLevel[] = [finestLevel(samples, samplesPerPeak)];
  while (levels[levels.length - 1].min.length > 1) {
    levels.push(coarserLevel(levels[levels.length - 1]));
  }
  return {
    levels,
    samplesPerPeak,
    sampleRate: options.sampleRate,
    // Every sample is present here, so length and time agree exactly.
    durationSec: samples.length / Math.max(1, options.sampleRate),
  };
}

/**
 * Builds one pyramid PER CHANNEL from an interleaved buffer.
 *
 * Peaks must be computed per channel: a stereo buffer interleaves L and R,
 * so summarizing it directly mixes the two channels inside every bucket
 * and yields a waveform that belongs to neither. Deinterleaving first
 * gives one honest pyramid per channel, which the viewer renders as
 * stacked rows (L above R).
 */
export function buildChannelPeakPyramids(
  interleaved: Float32Array,
  options: { channels: number; samplesPerPeak?: number; sampleRate: number },
): readonly PeakPyramid[] {
  const channels = Math.max(1, options.channels);
  if (channels === 1) {
    return [buildPeakPyramid(interleaved, options)];
  }
  const frames = Math.floor(interleaved.length / channels);
  const pyramids: PeakPyramid[] = [];
  for (let channel = 0; channel < channels; channel++) {
    const planar = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame++) {
      planar[frame] = interleaved[frame * channels + channel];
    }
    pyramids.push(buildPeakPyramid(planar, options));
  }
  return pyramids;
}

/** Conventional short labels for the first channels of a stream. */
export function channelLabel(index: number, channels: number): string {
  if (channels === 1) return "Mono";
  if (channels === 2) return index === 0 ? "L" : "R";
  return `Ch ${index + 1}`;
}

/**
 * Picks the coarsest LOD that still has at least one peak per screen
 * pixel across the visible range — coarser would under-sample and lose
 * transients; finer wastes texture bandwidth the eye can't resolve.
 */
export function chooseLod(
  pyramid: PeakPyramid,
  args: { viewDurationSec: number; pixelWidth: number },
): number {
  if (args.pixelWidth <= 0 || args.viewDurationSec <= 0) {
    return 0;
  }
  const peaksPerSecond = pyramid.sampleRate / pyramid.samplesPerPeak;
  const visiblePeaksAtLod0 = args.viewDurationSec * peaksPerSecond;
  const targetPeaksPerPixel = 1;
  let lod = 0;
  while (
    lod < pyramid.levels.length - 1 &&
    visiblePeaksAtLod0 / 2 ** lod > args.pixelWidth * targetPeaksPerPixel
  ) {
    lod++;
  }
  return lod;
}

/** A synthetic sine-ish waveform for stories/tests — no MCAP dependency. */
export function synthesizePeaks(args: {
  durationSec: number;
  sampleRate?: number;
  frequencyHz?: number;
  samplesPerPeak?: number;
}): PeakPyramid {
  const sampleRate = args.sampleRate ?? 48_000;
  const frequencyHz = args.frequencyHz ?? 220;
  const sampleCount = Math.max(1, Math.round(args.durationSec * sampleRate));
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    // A little amplitude drift so the waveform reads as "real" rather than
    // a perfectly uniform tone in manual review.
    const envelope = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 4);
    samples[i] = envelope * Math.sin(2 * Math.PI * frequencyHz * t);
  }
  return buildPeakPyramid(samples, {
    sampleRate,
    samplesPerPeak: args.samplesPerPeak,
  });
}
