// ---------------------------------------------------------------------------
// WebCodecs decode for `foxglove.CompressedAudio` chunks.
//
// Turns encoded chunks (opus/aac/mp3/flac/pcm) into the SAME interleaved
// `Float32Array` shape the RawAudio path produces, so everything downstream
// — peak pyramid, AudioBuffer, GainNode playback — stays codec-agnostic and
// needs no branch on how the audio arrived.
// ---------------------------------------------------------------------------

import {
  audioCodecFromFormat,
  webCodecForAudioFormat,
} from "../codecs/audio-format";

export interface CompressedAudioChunk {
  readonly bytes: Uint8Array;
  readonly timestampNs: bigint;
  readonly format: string;
}

export interface DecodedCompressedAudio {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
}

/** Whether this browser exposes the WebCodecs `AudioDecoder` at all. */
export function hasAudioDecoder(): boolean {
  return typeof globalThis !== "undefined" && "AudioDecoder" in globalThis;
}

/**
 * Decodes compressed chunks in timestamp order into one interleaved PCM
 * buffer. Resolves `null` when the codec isn't supported by this browser
 * (the caller surfaces that as "unsupported" rather than an error, since a
 * recording is not broken just because a codec is missing).
 *
 * The first `AudioData` output establishes sample rate and channel count;
 * every codec here is constant-rate within a stream, so later frames are
 * appended without resampling.
 */
export async function decodeCompressedAudio(
  chunks: readonly CompressedAudioChunk[],
  signal?: AbortSignal,
): Promise<DecodedCompressedAudio | null> {
  if (chunks.length === 0 || !hasAudioDecoder()) {
    return null;
  }

  const codec = audioCodecFromFormat(chunks[0].format);
  if (!codec) return null;
  const webCodec = webCodecForAudioFormat(codec);

  const ordered = [...chunks].sort((a, b) =>
    a.timestampNs < b.timestampNs ? -1 : a.timestampNs > b.timestampNs ? 1 : 0,
  );
  const baseNs = ordered[0].timestampNs;

  const blocks: Float32Array[] = [];
  let sampleRate = 0;
  let channels = 0;
  let failure: Error | null = null;

  const EncodedAudioChunkCtor = (
    globalThis as unknown as {
      AudioDecoder: new (init: {
        output: (data: AudioDataLike) => void;
        error: (error: Error) => void;
      }) => AudioDecoderLike;
      EncodedAudioChunk: new (init: {
        type: "key";
        timestamp: number;
        data: Uint8Array;
      }) => unknown;
    }
  ).EncodedAudioChunk;
  const AudioDecoderCtor = (
    globalThis as unknown as {
      AudioDecoder: {
        new (init: {
          output: (data: AudioDataLike) => void;
          error: (error: Error) => void;
        }): AudioDecoderLike;
        isConfigSupported?: (config: {
          codec: string;
          sampleRate: number;
          numberOfChannels: number;
        }) => Promise<{ supported?: boolean }>;
      };
    }
  ).AudioDecoder;

  const decoder = new AudioDecoderCtor({
    output: (data) => {
      // `AudioData` carries planar or interleaved frames depending on the
      // codec; copyTo with "f32" normalizes to interleaved float, matching
      // the RawAudio path's layout.
      sampleRate ||= data.sampleRate;
      channels ||= data.numberOfChannels;
      const frames = data.numberOfFrames * data.numberOfChannels;
      const out = new Float32Array(frames);
      try {
        data.copyTo(out, { planeIndex: 0, format: "f32" });
      } catch {
        // Some implementations only expose the codec's native layout;
        // fall back to whatever plane 0 provides rather than dropping audio.
        data.copyTo(out, { planeIndex: 0 });
      }
      blocks.push(out);
      data.close();
    },
    error: (error) => {
      failure = error;
    },
  });

  try {
    decoder.configure({
      codec: webCodec,
      sampleRate: 48_000,
      numberOfChannels: 2,
    });

    for (const chunk of ordered) {
      if (signal?.aborted) break;
      decoder.decode(
        new EncodedAudioChunkCtor({
          type: "key",
          // EncodedAudioChunk timestamps are microseconds, relative to the
          // stream start so the first chunk lands at 0.
          timestamp: Number((chunk.timestampNs - baseNs) / 1000n),
          data: chunk.bytes,
        }) as never,
      );
    }

    await decoder.flush();
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      decoder.close();
    } catch {
      // Already closed by an error path; nothing to release.
    }
  }

  // An aborted decode returns null, not the partial buffer it managed to
  // produce: the caller cannot tell a truncated result from a complete one,
  // and would otherwise store audio for a component that has unmounted.
  if (signal?.aborted || failure || blocks.length === 0 || sampleRate === 0) {
    return null;
  }

  const total = blocks.reduce((sum, block) => sum + block.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const block of blocks) {
    samples.set(block, offset);
    offset += block.length;
  }

  return { samples, sampleRate, channels: Math.max(1, channels) };
}

/** Minimal structural types — `lib.dom` may predate WebCodecs. */
interface AudioDataLike {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly numberOfFrames: number;
  copyTo(destination: Float32Array, options: Record<string, unknown>): void;
  close(): void;
}

interface AudioDecoderLike {
  configure(config: {
    codec: string;
    sampleRate: number;
    numberOfChannels: number;
  }): void;
  decode(chunk: never): void;
  flush(): Promise<void>;
  close(): void;
}
