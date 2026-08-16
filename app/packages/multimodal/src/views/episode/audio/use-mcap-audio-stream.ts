// ---------------------------------------------------------------------------
// MCAP -> format-neutral audio binding.
//
// This module's ONLY job is to turn MCAP frames into `PcmAudioData` and
// hand them to `useAudioPlayback`. All playback, mixing, peak, and engine
// behavior lives in the container-neutral `src/audio/` layer, so a
// non-MCAP audio dataset (bare .wav/.mp3 files, a different container, a
// remote stream) reuses that path by supplying its own `AudioLoader` —
// nothing here needs to be generalized again.
//
// It lives under `views/` rather than `adapters/` because it is a React
// hook: the MCAP adapter layers are required to stay headless (see
// `mcap-core-layers-are-headless` in .dependency-cruiser.cjs), and this
// needs `useDataStream()` from the view layer.
//
// SIMPLIFICATION: reads the stream's full time range once
// (`readStreamFrames`) instead of paging against playhead demand. Audio is
// far smaller than video per unit time; revisit if very long recordings
// make full-buffer decode too slow or memory-heavy.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from "react";
import {
  useAudioPlayback,
  type AudioLoadResult,
  type AudioMetadata,
  type PcmAudioData,
  type UseAudioPlaybackResult,
  concatPcmChunks,
  pcmToFloat32,
} from "../../../audio";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import { useDataStream } from "../playback/data-stream-context";
import {
  decodeCompressedAudio,
  type CompressedAudioChunk,
} from "../../../audio/decode-compressed-audio";

// `deadlineMs` is an ABSOLUTE timestamp that the reader converts into a
// `setTimeout` delay, and a non-finite delay is coerced to 0 by the HTML
// spec — `Infinity` here would abort the read on the next tick, yielding
// zero frames. Always a finite budget, computed per call.
const ONE_SHOT_READ_TIMEOUT_MS = 60_000;

function oneShotBudget() {
  return {
    deadlineMs: monotonicNowMs() + ONE_SHOT_READ_TIMEOUT_MS,
    maxMessages: 100_000,
    maxObservedPayloadBytes: 256 * 1024 * 1024,
  } as const;
}

export type { UseAudioPlaybackResult as UseMcapAudioStreamResult };

export interface UseMcapAudioStreamOptions {
  /** Display name for the mixer row / tile header. */
  readonly label?: string;
  /**
   * Whether this instance owns audible playback. Exactly one mounted
   * instance per stream may — see `useAudioPlayback`.
   * @default true
   */
  readonly playback?: boolean;
}

/**
 * Drives one audio track from an MCAP stream carrying Foxglove RawAudio or
 * CompressedAudio messages.
 */
export function useMcapAudioStream(
  streamId: string,
  { label, playback = true }: UseMcapAudioStreamOptions = {},
): UseAudioPlaybackResult {
  const dataStream = useDataStream();
  const readStreamFrames = dataStream?.readStreamFrames;
  const getTimelineIndex = dataStream?.getTimelineIndex;

  const load = useCallback(
    async (signal?: AbortSignal): Promise<AudioLoadResult> => {
      if (!readStreamFrames || !getTimelineIndex) {
        return { ok: false, reason: "empty" };
      }
      const timeline = getTimelineIndex();
      if (!timeline) {
        return { ok: false, reason: "empty" };
      }

      const result = await readStreamFrames({
        budget: oneShotBudget(),
        endTimeNs: timeline.endTimeNs,
        startTimeNs: timeline.startTimeNs,
        stream: streamId,
      });
      if (!result || signal?.aborted) return { ok: false, reason: "empty" };

      const rawChunks: Array<PcmAudioData & { timestampNs: bigint }> = [];
      const compressedChunks: CompressedAudioChunk[] = [];
      let encodedBytes = 0;
      let format: string | undefined;

      for (const frame of result.frames) {
        const visualization = frame.output.visualization;
        if (visualization?.kind === VISUALIZATION_KIND.RAW_AUDIO) {
          rawChunks.push({
            channels: visualization.channels,
            sampleRate: visualization.sampleRate,
            samples: pcmToFloat32(visualization.samples),
            timestampNs: frame.timestampNs,
          });
          format ??= String(frame.output.attributes?.format ?? "");
          encodedBytes += Number(frame.output.attributes?.byteLength ?? 0);
        } else if (
          visualization?.kind === VISUALIZATION_KIND.COMPRESSED_AUDIO
        ) {
          compressedChunks.push({
            bytes: visualization.bytes,
            format: visualization.format,
            timestampNs: frame.timestampNs,
          });
          format ??= visualization.format;
          encodedBytes += visualization.bytes.byteLength;
        }
      }

      // Compressed chunks decode to the same interleaved float layout the
      // raw branch produces, so everything downstream is codec-agnostic.
      if (rawChunks.length === 0 && compressedChunks.length > 0) {
        const decoded = await decodeCompressedAudio(compressedChunks, signal);
        if (signal?.aborted) return { ok: false, reason: "empty" };
        if (!decoded) {
          // A codec this browser cannot decode is not a broken recording.
          return {
            ok: false,
            reason: "unsupported",
            detail: compressedChunks[0]?.format,
          };
        }
        rawChunks.push({
          ...decoded,
          timestampNs: compressedChunks[0].timestampNs,
        });
      }

      if (rawChunks.length === 0) {
        return { ok: false, reason: "empty" };
      }

      rawChunks.sort((a, b) => (a.timestampNs < b.timestampNs ? -1 : 1));
      const data = concatPcmChunks(rawChunks);
      if (!data) {
        // Non-uniform sample rate/channel count across chunks — see
        // `concatPcmChunks`. Report it rather than emit corrupt audio.
        return {
          ok: false,
          reason: "error",
          detail: "audio format changes mid-stream",
        };
      }

      const metadata: AudioMetadata = {
        byteLength: encodedBytes || undefined,
        channels: data.channels,
        chunkCount: rawChunks.length + compressedChunks.length,
        durationSec:
          data.samples.length / Math.max(1, data.channels) / data.sampleRate,
        format: format || undefined,
        sampleRate: data.sampleRate,
      };
      return { ok: true, data, metadata };
    },
    [getTimelineIndex, readStreamFrames, streamId],
  );

  return useAudioPlayback({
    kind: "pcm",
    label,
    load: useMemo(() => (streamId ? load : null), [load, streamId]),
    playback,
    trackId: streamId,
  });
}
