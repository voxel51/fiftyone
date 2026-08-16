// ---------------------------------------------------------------------------
// React seam between the MCAP worker/resource-client pipeline and the
// Phase 1 multi-track audio system (`@fiftyone/playback`'s `useAudio()`).
// Every audio source registers the same three things `use-audio-stream.ts`
// does for its native-element source — an `AudioTrackDescriptor`, a
// `PlaybackStream`, and master-level `audioAvailableAtom` publication — so
// this hook is just a second/third caller of the same public API
// (`registerAudioTrack`/`registerStream`/`setAudioAvailable`). No change
// to `useAudio()`, `atoms.ts`, `store-access.ts`, `VolumeControl.tsx`,
// `MixedAudioDropdown.tsx`, or the tile mute-button plumbing was needed to
// land this.
//
// SIMPLIFICATION vs. the incremental VideoPlaybackManager pattern other
// media types use: this hook reads a stream's full time range once into
// memory (`readStreamFrames` with a generous one-shot budget) rather than
// paging incrementally against playhead demand. Audio streams are orders
// of magnitude smaller than video for a given duration, so this is a
// reasonable first landing; revisit with incremental reads if very long
// recordings make full-buffer decode too slow/memory-heavy.
// ---------------------------------------------------------------------------

import {
  registerAudioTrack as registerAudioTrackImpl,
  getEffectiveTrackVolume,
  getPlayhead,
  isMasterMuteAtSessionDefault,
  setAudioAvailable,
  setMasterMuted,
  usePlayback,
  usePlaybackStore,
  useEffectiveTrackVolume,
  useIsPlaying,
  useSeekEvent,
  type PlaybackStream,
} from "@fiftyone/playback";
import { useEffect, useMemo, useRef, useState } from "react";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { buildPeakPyramid, type PeakPyramid } from "../../../views/episode/audio/peak-pyramid";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import {
  decodeCompressedAudio,
  type CompressedAudioChunk,
} from "./decode-compressed-audio";
import { useDataStream } from "../../../views/episode/playback/data-stream-context";

// `deadlineMs` is an ABSOLUTE timestamp, and the reader turns it into a
// `setTimeout` delay. A non-finite delay is coerced to 0 by the HTML spec,
// so `Number.POSITIVE_INFINITY` here did not mean "no deadline" — it
// aborted the read on the next tick, every time, yielding zero frames
// (`stopReason: "wall-time-ceiling"`). Use a generous FINITE budget,
// computed per call since it is absolute rather than a duration.
const ONE_SHOT_READ_TIMEOUT_MS = 60_000;

function oneShotBudget() {
  return {
    deadlineMs: monotonicNowMs() + ONE_SHOT_READ_TIMEOUT_MS,
    maxMessages: 100_000,
    maxObservedPayloadBytes: 256 * 1024 * 1024,
  } as const;
}

export type PcmDecodeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

export interface UsePCMAudioStreamResult {
  readonly waveformPeaks: PeakPyramid | null;
  readonly hasAudio: boolean;
  readonly decodeStatus: PcmDecodeStatus;
}

/**
 * Drives one audio track from a decoded Foxglove RawAudio or
 * CompressedAudio MCAP stream: accumulates PCM in time order, computes a
 * waveform peak pyramid, and feeds a Web Audio `GainNode` (gain tracking
 * this track's effective volume) into an `AudioContext` for playback,
 * gated by the same engine barrier every other audio source uses.
 */
const DRIFT_TOLERANCE_S = 0.15;

export interface UsePCMAudioStreamOptions {
  /**
   * Whether this instance owns audible playback for the stream — builds
   * the `AudioContext`/`GainNode` graph, registers the engine
   * `PlaybackStream`, and starts/stops buffer sources.
   *
   * Exactly ONE mounted instance per stream may own playback. The ambient
   * registrar (`RegisterMcapAudioStreams`) is that owner; a view that
   * only needs the waveform (e.g. `AudioTile`) must pass `false`, or the
   * two instances would each build their own AudioContext for the same
   * stream — doubling the audible signal and, because browsers cap
   * concurrent AudioContexts per page, quickly exhausting that budget
   * until context construction fails and everything goes silent.
   *
   * @default true
   */
  readonly playback?: boolean;
}

export function usePCMAudioStream(
  streamId: string,
  { playback = true }: UsePCMAudioStreamOptions = {},
): UsePCMAudioStreamResult {
  const dataStream = useDataStream();
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const seekEvent = useSeekEvent();

  const [decodeStatus, setDecodeStatus] = useState<PcmDecodeStatus>("idle");
  const [waveformPeaks, setWaveformPeaks] = useState<PeakPyramid | null>(null);
  const [hasAudio, setHasAudio] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const gainConnectedRef = useRef(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  // Web Audio has no true pause — a `AudioBufferSourceNode` is one-shot.
  // "Paused" is modeled as no live source node; resuming creates a fresh
  // one at the current playhead offset, mirroring how `use-audio-stream.ts`
  // re-anchors `currentTime` on activation.
  // `contextTimeAtStart - engineTimeAtStart` lets onCommit compute expected
  // playback position without re-reading it every RAF tick.
  const startOffsetRef = useRef<{ contextTime: number; engineTime: number } | null>(
    null,
  );

  // One-shot decode: read the stream's full range, accumulate PCM,
  // compute peaks, and prepare an AudioBuffer for playback.
  useEffect(() => {
    if (!dataStream?.readStreamFrames) {
      return undefined;
    }
    const timeline = dataStream.getTimelineIndex();
    if (!timeline) {
      return undefined;
    }

    let cancelled = false;
    setDecodeStatus("loading");

    (async () => {
      const result = await dataStream.readStreamFrames?.({
        budget: oneShotBudget(),
        endTimeNs: timeline.endTimeNs,
        startTimeNs: timeline.startTimeNs,
        stream: streamId,
      });
      probe("read", {
        streamId,
        playback,
        hasResult: Boolean(result),
        frameCount: result?.frames.length,
        stopReason: result?.stopReason,
        kinds: result?.frames.slice(0, 5).map((f) => f.output.visualization?.kind ?? "none"),
        attrs: result?.frames.slice(0, 2).map((f) => JSON.stringify(f.output.attributes ?? {}).slice(0, 160)),
      });
      if (cancelled || !result) return;

      const rawChunks: Array<{ timestampNs: bigint; samples: Float32Array; sampleRate: number; channels: number }> = [];
      const compressedChunks: CompressedAudioChunk[] = [];

      for (const frame of result.frames) {
        const visualization = frame.output.visualization;
        if (visualization?.kind === VISUALIZATION_KIND.RAW_AUDIO) {
          rawChunks.push({
            channels: visualization.channels,
            samples: toFloat32(visualization.samples),
            sampleRate: visualization.sampleRate,
            timestampNs: frame.timestampNs,
          });
        } else if (visualization?.kind === VISUALIZATION_KIND.COMPRESSED_AUDIO) {
          compressedChunks.push({
            bytes: visualization.bytes,
            format: visualization.format,
            timestampNs: frame.timestampNs,
          });
        }
      }

      if (cancelled) return;

      // Compressed chunks decode through WebCodecs into the same
      // interleaved float layout the RawAudio branch produces, so
      // everything below this point is codec-agnostic.
      if (rawChunks.length === 0 && compressedChunks.length > 0) {
        const decoded = await decodeCompressedAudio(compressedChunks);
        if (cancelled) return;
        probe("decodedCompressed", {
          streamId,
          playback,
          chunks: compressedChunks.length,
          format: compressedChunks[0]?.format,
          ok: Boolean(decoded),
          sampleRate: decoded?.sampleRate,
          channels: decoded?.channels,
          samples: decoded?.samples.length,
        });
        if (!decoded) {
          // A codec this browser cannot decode is not a broken recording —
          // report it as unsupported, with the stream still present.
          setHasAudio(true);
          setDecodeStatus("unsupported");
          return;
        }
        rawChunks.push({
          channels: decoded.channels,
          samples: decoded.samples,
          sampleRate: decoded.sampleRate,
          timestampNs: compressedChunks[0].timestampNs,
        });
      }

      if (rawChunks.length === 0) {
        setHasAudio(false);
        setDecodeStatus("idle");
        return;
      }

      rawChunks.sort((a, b) => (a.timestampNs < b.timestampNs ? -1 : 1));
      const sampleRate = rawChunks[0].sampleRate;
      const channels = rawChunks[0].channels;
      const totalLength = rawChunks.reduce((sum, chunk) => sum + chunk.samples.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of rawChunks) {
        merged.set(chunk.samples, offset);
        offset += chunk.samples.length;
      }

      setWaveformPeaks(buildPeakPyramid(merged, { sampleRate }));
      setHasAudio(true);

      // Waveform-only consumers stop here: no AudioContext, no buffer,
      // no engine registration. `decodeStatus` still reaches "ready" so
      // their UI reflects a successful decode.
      if (!playback) {
        setDecodeStatus("ready");
        return;
      }

      try {
        const AudioContextCtor =
          typeof window !== "undefined"
            ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
            : undefined;
        if (!AudioContextCtor) {
          setDecodeStatus("unsupported");
          return;
        }
        const audioContext = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = audioContext;
        const buffer = audioContext.createBuffer(
          Math.max(1, channels),
          Math.max(1, Math.floor(merged.length / Math.max(1, channels))),
          sampleRate,
        );
        // Interleaved-to-planar: RawAudio packs channels interleaved.
        for (let channel = 0; channel < channels; channel++) {
          const planar = buffer.getChannelData(channel);
          for (let i = 0; i < planar.length; i++) {
            planar[i] = merged[i * channels + channel] ?? 0;
          }
        }
        audioBufferRef.current = buffer;
        probe("decoded", {
          streamId,
          playback,
          channels,
          sampleRate,
          samples: merged.length,
          bufferDuration: buffer.duration,
          contextState: audioContext.state,
        });
        setDecodeStatus("ready");
      } catch (err) {
        probe("decodeError", { streamId, playback, message: String(err) });
        setDecodeStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataStream, streamId, playback]);

  // Roster registration — "just another audio source". Registers as soon
  // as a real source is bound (`streamId` non-empty), NOT gated on
  // `hasAudio`: a source can be correctly classified as audio but fail to
  // decode (unsupported encoding, decoder mismatch, etc.), and the Mixed
  // dropdown / tile mute button should still show that track exists —
  // only actual playback (the engine PlaybackStream registration below)
  // needs `decodeStatus === "ready"`.
  useEffect(() => {
    if (!streamId) return undefined;
    return registerAudioTrackImpl(store, {
      id: streamId,
      kind: "foxglove-raw",
      label: streamId,
    });
  }, [store, streamId]);

  // Publish master-level availability so `VolumeControl` (which gates on
  // this single flag, same as the native-element source) shows up for
  // MCAP-sourced audio too — not just for `use-audio-stream.ts`'s
  // video-annotation path. Same non-gating rationale as the roster
  // registration above: availability reflects "a real audio source is
  // bound", not "it decoded successfully". Known simplification: like the
  // native-element source, this is a plain set/unset with no refcounting,
  // so two simultaneously-mounted audio sources unmounting in the wrong
  // order could transiently under-report availability; acceptable until a
  // multi-source scene actually needs this hardened.
  useEffect(() => {
    if (!streamId) return undefined;
    setAudioAvailable(store, "available");
    return () => setAudioAvailable(store, "unavailable");
  }, [store, streamId]);

  // Engine stream registration — this source is fully decoded into memory
  // by the time it reaches "ready", so it never blocks the barrier
  // (`blocking: false`); a stream this hook can't yet decode
  // ("unsupported"/"error") likewise never holds up the rest of the
  // timeline.
  useEffect(() => {
    if (!playback || decodeStatus !== "ready" || !audioBufferRef.current) {
      return undefined;
    }
    const stream: PlaybackStream = {
      id: streamId,
      blocking: false,
      bufferState: () => "ready",
      onCommit: (time) => {
        if (!isPlaying) return;
        const started = startOffsetRef.current;
        const audioContext = audioContextRef.current;
        if (!started || !audioContext) return;
        const expected = started.engineTime + (audioContext.currentTime - started.contextTime);
        if (Math.abs(expected - time) > DRIFT_TOLERANCE_S) {
          startPlayback(time);
        }
      },
    };
    const unregister = registerStream(stream);
    const unsubscribe = subscribeStream(streamId);
    return () => {
      unsubscribe();
      unregister();
      stopPlayback();
    };
  }, [playback, decodeStatus, registerStream, subscribeStream, streamId]);

  // Transport: start a fresh source node on play (Web Audio has no true
  // pause/resume for `AudioBufferSourceNode`), stop on pause.
  useEffect(() => {
    probe("transport", { streamId, playback, decodeStatus, isPlaying });
    if (!playback || decodeStatus !== "ready") return undefined;
    if (isPlaying) {
      // Master mute starts on every session to satisfy browser autoplay
      // policy — it is waiting for exactly this gesture. Pressing play with
      // decoded audio present is an explicit request to hear it, so clear
      // the untouched default. A viewer who muted deliberately has a stored
      // value and is never overridden.
      if (isMasterMuteAtSessionDefault()) {
        setMasterMuted(store, false);
      }
      startPlayback(getPlayhead(store));
    } else {
      stopPlayback();
    }
    return undefined;
  }, [playback, decodeStatus, isPlaying, store]);

  // Discontinuous jumps (scrub, step, loop wrap) restart from the new
  // position while playing; a paused seek just waits for the next play.
  useEffect(() => {
    if (!playback || decodeStatus !== "ready" || !isPlaying || !seekEvent) return undefined;
    startPlayback(seekEvent.time);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekEvent?.seq]);

  function ensureAudioGraph(): { audioContext: AudioContext; gain: GainNode } | null {
    const audioContext = audioContextRef.current;
    if (!audioContext) return null;
    // An AudioContext constructed outside a user gesture starts
    // "suspended" and produces no sound until resumed. This one is built
    // during decode, so it is always suspended on arrival; play is a user
    // gesture, which is what makes this resume permitted.
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    const gain = gainNodeRef.current ?? (gainNodeRef.current = audioContext.createGain());
    gain.gain.value = getEffectiveTrackVolume(store, streamId);
    // `numberOfOutputs` is a NODE-TYPE constant (a GainNode always reports
    // 1), not a live connection count — testing it meant this branch never
    // ran and the gain node was never wired to the destination, so nothing
    // was ever audible. Track the connection explicitly instead.
    if (!gainConnectedRef.current) {
      gain.connect(audioContext.destination);
      gainConnectedRef.current = true;
    }
    return { audioContext, gain };
  }

  function startPlayback(time: number): void {
    const buffer = audioBufferRef.current;
    const graph = ensureAudioGraph();
    probe("startPlayback", {
      time,
      hasBuffer: Boolean(buffer),
      hasGraph: Boolean(graph),
      bufferDuration: buffer?.duration,
      contextState: audioContextRef.current?.state,
      gain: gainNodeRef.current?.gain.value,
      gainConnected: gainConnectedRef.current,
    });
    if (!buffer || !graph) return;
    stopPlayback();
    const { audioContext, gain } = graph;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const offset = Math.min(Math.max(time, 0), buffer.duration);
    source.start(0, offset);
    sourceNodeRef.current = source;
    startOffsetRef.current = { contextTime: audioContext.currentTime, engineTime: time };
  }

  function stopPlayback(): void {
    const source = sourceNodeRef.current;
    sourceNodeRef.current = null;
    startOffsetRef.current = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // `stop()` throws InvalidStateError on a node that was never
      // started. Nothing to stop is the desired end state either way, and
      // letting it escape would abort the caller mid-restart.
    }
    source.disconnect();
  }

  // Volume/mute changes apply live without restarting playback — the
  // reactive `useEffectiveTrackVolume` re-renders this hook, and this
  // effect just re-applies the number to the already-connected GainNode.
  const effectiveVolume = useEffectiveTrackVolume(streamId);
  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) {
      gain.gain.value = effectiveVolume;
    }
  }, [effectiveVolume]);

  // Release the AudioContext on unmount. Browsers cap concurrent
  // AudioContexts (Chrome allows only a handful per page), and this hook
  // creates one per decode — remounts and source changes would otherwise
  // leak them until construction started failing, which surfaces as
  // permanent silence rather than an obvious error.
  useEffect(
    () => () => {
      stopPlayback();
      gainNodeRef.current?.disconnect();
      gainNodeRef.current = null;
      gainConnectedRef.current = false;
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      void audioContext?.close().catch(() => undefined);
    },
    [],
  );

  return useMemo(
    () => ({ decodeStatus, hasAudio, waveformPeaks }),
    [decodeStatus, hasAudio, waveformPeaks],
  );
}

/**
 * TEMPORARY diagnostic: records the audio graph's state on `window` so a
 * silent-but-"ready" stream can be inspected from a real browser session.
 * The playback-owning hook instance is headless (no UI of its own), so
 * there is otherwise no way to observe whether it reached playback.
 * Remove once MCAP audio playback is confirmed working end to end.
 */
function probe(event: string, detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const target = window as unknown as {
    __foAudio?: Array<Record<string, unknown>>;
  };
  target.__foAudio = target.__foAudio ?? [];
  target.__foAudio.push({ event, ...detail });
}

function toFloat32(
  samples: Int8Array | Uint8Array | Int16Array | Int32Array | Float32Array,
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
        : samples instanceof Uint8Array
          ? 1 / 128
          : 1 / 128;
  const isUnsigned = samples instanceof Uint8Array;
  for (let i = 0; i < samples.length; i++) {
    out[i] = isUnsigned ? samples[i] * scale - 1 : samples[i] * scale;
  }
  return out;
}
