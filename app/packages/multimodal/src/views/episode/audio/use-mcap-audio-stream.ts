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
// Two transports are wired here. The streaming path pages windowed reads
// into a bounded ring and is preferred; the buffered path reads the full
// time range once and stays as the fallback for contexts without
// `SharedArrayBuffer` (notebook/Colab embeds, Safari). Both hooks are
// called unconditionally with one disabled — the choice can flip at
// runtime, and a conditional call would break the rules of hooks.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAudioPlayback,
  useAudioStreamPlayback,
  type AudioStreamSource,
  type AudioWindowReader,
  type AudioLoadResult,
  type AudioMetadata,
  type PcmAudioData,
  type UseAudioPlaybackResult,
  concatPcmChunks,
  pcmToFloat32,
} from "../../../audio";
import { IDLE_AUDIO_SOURCE_STATE } from "../../../audio/audio-source-registry";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { canUseSharedRingBuffer } from "../../../audio";
import type { DecodedFrame } from "../../../ir";
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

/**
 * One window is orders of magnitude smaller than the whole recording, so
 * these bounds are tight — a window that cannot be read inside them is a
 * starved ring, and failing fast lets the pump retry rather than block.
 */
function windowBudget() {
  return {
    deadlineMs: monotonicNowMs() + 15_000,
    maxMessages: 20_000,
    maxObservedPayloadBytes: 64 * 1024 * 1024,
  } as const;
}

/**
 * Length of the discovery read. The engine needs the real sample rate and
 * channel count before it can build a context, and only the decoded audio
 * knows them — `foxglove.CompressedAudio` carries neither in its manifest.
 */
const PROBE_SECONDS = 0.5;

function oneShotBudget() {
  return {
    deadlineMs: monotonicNowMs() + ONE_SHOT_READ_TIMEOUT_MS,
    maxMessages: 100_000,
    maxObservedPayloadBytes: 256 * 1024 * 1024,
  } as const;
}

/**
 * Folds one read's frames into a single interleaved PCM block. Shared by
 * both transports: the buffered path calls it once over the whole
 * recording, the streaming path once per window, and neither should have
 * its own copy of the RawAudio/CompressedAudio handling.
 */
async function framesToPcm(
  frames: readonly DecodedFrame[],
  signal?: AbortSignal,
): Promise<AudioLoadResult> {
  const rawChunks: Array<PcmAudioData & { timestampNs: bigint }> = [];
  const compressedChunks: CompressedAudioChunk[] = [];
  let encodedBytes = 0;
  let format: string | undefined;

  for (const frame of frames) {
    const visualization = frame.output.visualization;
    if (visualization?.kind === VISUALIZATION_KIND.RAW_AUDIO) {
      rawChunks.push({
        channels: visualization.channels,
        sampleRate: visualization.sampleRate,
        samples: pcmToFloat32(visualization.samples),
        timestampNs: frame.timestampNs,
      });
      // `??=` would latch an empty string forever (it is not nullish),
      // so only accept a non-empty format.
      format ||= String(frame.output.attributes?.format ?? "");
      encodedBytes += Number(frame.output.attributes?.byteLength ?? 0);
    } else if (visualization?.kind === VISUALIZATION_KIND.ENCODED_AUDIO) {
      compressedChunks.push({
        bytes: visualization.bytes,
        format: visualization.format,
        timestampNs: frame.timestampNs,
      });
      format ||= visualization.format;
      encodedBytes += visualization.bytes.byteLength;
    }
  }

  // Count the source messages, not the intermediate buffers: the
  // compressed branch below pushes its single decoded block into
  // `rawChunks`, so reading their lengths after that point would
  // double-count.
  const sourceChunkCount = rawChunks.length + compressedChunks.length;

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
    chunkCount: sourceChunkCount,
    durationSec:
      data.samples.length / Math.max(1, data.channels) / data.sampleRate,
    format: format || undefined,
    sampleRate: data.sampleRate,
  };
  return { ok: true, data, metadata };
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
  /**
   * Whether anything actually wants this source's samples. When `false` the
   * hook reads nothing at all — no probe, no window paging, no full-range
   * fallback — and reports the idle result.
   *
   * This is the difference between a recording advertising that it has audio
   * and a recording decoding it. Mounting this hook used to be the same act
   * as starting the reader, so opening any MCAP began decoding every audio
   * topic in it whether or not a listener existed.
   * @default true
   */
  readonly enabled?: boolean;
}

/**
 * Drives one audio track from an MCAP stream carrying Foxglove RawAudio or
 * CompressedAudio messages.
 */
export function useMcapAudioStream(
  streamId: string,
  { label, playback = true, enabled = true }: UseMcapAudioStreamOptions = {},
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

      // `signal` reaches the reader itself, not just the post-await check
      // below: this is a whole-recording read, and without it closing the
      // tile left the fetch and decode running to completion in the
      // background. `readWindowDetailed` has always passed it.
      const result = await readStreamFrames({
        budget: oneShotBudget(),
        endTimeNs: timeline.endTimeNs,
        startTimeNs: timeline.startTimeNs,
        stream: streamId,
        signal,
      });
      if (!result || signal?.aborted) return { ok: false, reason: "empty" };

      return framesToPcm(result.frames, signal);
    },
    [getTimelineIndex, readStreamFrames, streamId],
  );

  // Reads one window of the recording. Time is expressed relative to the
  // timeline origin, which is what the pump and the playhead both use.
  const readWindowDetailed = useCallback(
    async (
      startSec: number,
      endSec: number,
      signal: AbortSignal,
    ): Promise<AudioLoadResult> => {
      if (!readStreamFrames || !getTimelineIndex) {
        return { ok: false, reason: "empty" };
      }
      const timeline = getTimelineIndex();
      if (!timeline) return { ok: false, reason: "empty" };

      const result = await readStreamFrames({
        budget: windowBudget(),
        startTimeNs: timeline.secToNs(startSec),
        endTimeNs: timeline.secToNs(endSec),
        stream: streamId,
        signal,
      });
      if (!result || signal.aborted) return { ok: false, reason: "empty" };

      return framesToPcm(result.frames, signal);
    },
    [getTimelineIndex, readStreamFrames, streamId],
  );

  // The pump only wants PCM; the probe below also wants the metadata the
  // same decode already produced, hence the two layers.
  const readWindow = useCallback<AudioWindowReader>(
    async (startSec, endSec, signal) => {
      const decoded = await readWindowDetailed(startSec, endSec, signal);
      return decoded.ok ? decoded.data : null;
    },
    [readWindowDetailed],
  );

  // Discover the stream's real geometry before building an audio graph for
  // it. Only decoded audio knows the sample rate and channel count, so this
  // reads a short head window rather than trusting the manifest.
  const [streamSource, setStreamSource] = useState<AudioStreamSource | null>(
    null,
  );
  // Tri-state, not just `streamSource === null`. "Not yet known" and
  // "streaming unavailable" are different answers, and collapsing them
  // starts the buffered path's FULL-recording decode during every probe —
  // the exact up-front decode streaming exists to avoid. It also renders
  // the buffered waveform for a beat before the streaming one replaces it.
  const [probePending, setProbePending] = useState(() =>
    canUseSharedRingBuffer(),
  );
  useEffect(() => {
    if (!enabled) {
      setStreamSource(null);
      // Not "streaming is unavailable" — nothing has asked yet. Both
      // transports are disabled below regardless, so settling the probe
      // here just keeps the idle result from reporting "loading" forever.
      setProbePending(false);
      return undefined;
    }
    if (!streamId || !canUseSharedRingBuffer() || !getTimelineIndex) {
      setStreamSource(null);
      // Streaming can never run here, so the buffered path is the answer
      // now rather than after a probe that will not happen.
      setProbePending(false);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    // A new stream re-opens the question its predecessor had settled.
    setProbePending(true);

    void (async () => {
      const timeline = getTimelineIndex();
      if (!timeline) {
        if (!cancelled) setProbePending(false);
        return;
      }
      const probed = await readWindowDetailed(
        0,
        PROBE_SECONDS,
        controller.signal,
      );
      if (cancelled) return;
      if (
        !probed.ok ||
        probed.data.sampleRate <= 0 ||
        probed.data.channels <= 0
      ) {
        // Nothing decodable at the head: let the buffered path report why,
        // including "unsupported codec", which it distinguishes properly.
        setStreamSource(null);
        setProbePending(false);
        return;
      }
      setProbePending(false);
      setStreamSource({
        channels: probed.data.channels,
        durationSec: timeline.durationSec,
        read: readWindow,
        sampleRate: probed.data.sampleRate,
        // Byte and chunk counts describe the probe window only, so they are
        // dropped rather than reported as totals for the whole recording.
        metadata: {
          channels: probed.data.channels,
          codecLabel: probed.metadata?.codecLabel,
          durationSec: timeline.durationSec,
          format: probed.metadata?.format,
          sampleRate: probed.data.sampleRate,
        },
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, getTimelineIndex, readWindow, readWindowDetailed, streamId]);

  // Both transports are called unconditionally with one of them disabled —
  // a conditional hook call would break the rules of hooks, and the choice
  // can flip once at runtime when streaming turns out to be unavailable.
  const streaming = useAudioStreamPlayback({
    kind: "pcm",
    label,
    playback,
    // `useAudioPlayback` below registers the row on `trackId` alone, so it
    // stays put across this transport's activate/idle cycles.
    registerRoster: false,
    source: streamSource,
    trackId: streamId,
  });
  const streamingActive =
    enabled && Boolean(streamSource) && streaming.available;

  const buffered = useAudioPlayback({
    kind: "pcm",
    label,
    // Disabled while streaming owns the track: two transports decoding the
    // same source would build two audio graphs and double the signal.
    // Also disabled while the probe is still out — see `probePending`.
    load: useMemo(
      () =>
        enabled && streamId && !streamingActive && !probePending ? load : null,
      [enabled, load, probePending, streamId, streamingActive],
    ),
    playback,
    trackId: streamId,
  });

  // Nothing wants this source: report idle rather than the buffered
  // transport's "no audio", which would be a claim about the recording
  // rather than about whether anyone asked.
  if (!enabled) {
    return IDLE_AUDIO_SOURCE_STATE;
  }

  // While the probe is out neither transport is running, so report loading
  // rather than letting the idle buffered result render as "no audio".
  if (probePending && !streamingActive) {
    return {
      channels: 0,
      hasAudio: false,
      metadata: null,
      status: "loading",
      waveformPeaks: null,
    };
  }

  return streamingActive ? streaming : buffered;
}
