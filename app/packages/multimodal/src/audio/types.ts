// ---------------------------------------------------------------------------
// Format-neutral audio types.
//
// Nothing here knows about MCAP, Foxglove, or any container. An audio
// source — an MCAP topic, a bare .wav/.mp3 file, a remote stream, a test
// fixture — only has to produce `PcmAudioData`; everything downstream
// (peak pyramid, waveform, Web Audio playback, the mixer) is shared.
// ---------------------------------------------------------------------------

/**
 * Decoded PCM ready for playback and waveform rendering.
 *
 * `samples` is INTERLEAVED float in [-1, 1] — frame 0 channel 0, frame 0
 * channel 1, frame 1 channel 0, … Integer PCM must be normalized by the
 * loader (see `pcmToFloat32`), so consumers never branch on bit depth.
 */
export interface PcmAudioData {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
}

/** Why an audio source produced no playable PCM. */
export type AudioLoadFailure =
  /** Recognized as audio, but this browser/build cannot decode the codec. */
  | "unsupported"
  /** Decoding was attempted and failed. */
  | "error"
  /** Nothing audio-shaped was found in the source. */
  | "empty";

/**
 * The result of loading one audio source. A loader returns PCM on success
 * or a reason on failure — "no audio here" and "cannot decode this codec"
 * are different states the UI reports differently, so they are not
 * collapsed into `null`.
 */
export type AudioLoadResult =
  | {
      readonly ok: true;
      readonly data: PcmAudioData;
      readonly metadata?: AudioMetadata;
    }
  | {
      readonly ok: false;
      readonly reason: AudioLoadFailure;
      readonly detail?: string;
    };

/**
 * Descriptive facts about an audio source, surfaced in the settings
 * sidebar. Optional throughout: a loader reports what its container
 * actually knows.
 */
export interface AudioMetadata {
  /** Container/encoding the audio arrived in, e.g. "pcm-s16", "opus". */
  readonly format?: string;
  /** Human-readable codec label, e.g. "Opus", "16-bit signed PCM". */
  readonly codecLabel?: string;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly durationSec?: number;
  /** Encoded byte size, when the source can report it. */
  readonly byteLength?: number;
  /** Number of discrete chunks/messages the source was assembled from. */
  readonly chunkCount?: number;
}

/**
 * Loads one audio source's full PCM. Called once per source; the result is
 * cached for the lifetime of the mounted stream.
 *
 * Deliberately a plain async function rather than a class or React hook so
 * a non-MCAP source (a plain file fetch, a WebCodecs demux, a test double)
 * is trivial to implement.
 */
export type AudioLoader = (signal?: AbortSignal) => Promise<AudioLoadResult>;

/** Normalizes any PCM sample array to interleaved float in [-1, 1]. */
export function pcmToFloat32(
  samples: Uint8Array | Int16Array | Int32Array | Float32Array,
): Float32Array {
  if (samples instanceof Float32Array) {
    return samples;
  }
  const out = new Float32Array(samples.length);
  const scale =
    samples instanceof Int16Array
      ? 1 / 32_768
      : samples instanceof Int32Array
        ? 1 / 2_147_483_648
        : 1 / 128;
  // Unsigned 8-bit PCM is centered on 128 rather than 0.
  const isUnsigned = samples instanceof Uint8Array;
  for (let i = 0; i < samples.length; i++) {
    out[i] = isUnsigned ? samples[i] * scale - 1 : samples[i] * scale;
  }
  return out;
}

/**
 * Concatenates time-ordered PCM chunks into one interleaved buffer.
 *
 * Every chunk must share the first chunk's sample rate and channel count.
 * Concatenating mismatched chunks would interleave the buffer incorrectly
 * and play it at the wrong rate, so a format change mid-stream returns
 * `null` (the caller reports it) rather than silently producing corrupt
 * audio.
 */
export function concatPcmChunks(
  chunks: readonly PcmAudioData[],
): PcmAudioData | null {
  if (chunks.length === 0) return null;
  const { sampleRate, channels } = chunks[0];
  const uniform = chunks.every(
    (chunk) => chunk.sampleRate === sampleRate && chunk.channels === channels,
  );
  if (!uniform) return null;
  const total = chunks.reduce((sum, chunk) => sum + chunk.samples.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk.samples, offset);
    offset += chunk.samples.length;
  }
  return { samples, sampleRate, channels };
}
