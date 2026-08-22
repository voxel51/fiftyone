// ---------------------------------------------------------------------------
// Streaming counterpart to `useAudioPlayback`.
//
// Same public result, different transport: instead of decoding the source
// up front into one `AudioBuffer`, this keeps a bounded ring fed from
// windowed reads and lets an `AudioWorklet` drain it. Memory is a function
// of the ring, not the recording, so an hour-long track costs the same as a
// ten-second one.
//
// It is a sibling rather than a branch inside `useAudioPlayback` because
// the two transports share almost no machinery: there is no `AudioBuffer`,
// no one-shot source node, and the clock comes from the worklet instead of
// `AudioContext.currentTime`. Both hooks are called unconditionally by the
// caller with one of them passed `null`, which keeps the rules of hooks
// satisfied without a conditional call.
//
// Returns `available: false` when streaming cannot run here — off
// cross-origin isolation there is no `SharedArrayBuffer`, and the caller
// falls back to `useAudioPlayback`.
//
// `playback: false` consumers (the tile, which only draws a waveform) still
// stream: they run the same read loop so peaks fill in, but push into a
// discard sink instead of an audio graph. Gating the whole hook on
// `playback` would leave those consumers stuck reporting "no audio".
// ---------------------------------------------------------------------------

import {
  registerAudioTrack as registerAudioTrackImpl,
  getEffectiveTrackVolume,
  getPlayhead,
  isMasterMuteAtSessionDefault,
  setMasterMuted,
  usePlayback,
  usePlaybackStore,
  useEffectiveTrackVolume,
  useIsPlaying,
  useSeekEvent,
  type AudioSourceKind,
  type PlaybackStream,
} from "@fiftyone/playback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAudioStreamEngine,
  SharedAudioUnavailableError,
  type AudioStreamEngine,
} from "./audio-stream-engine";
import {
  createAudioStreamPump,
  type AudioStreamPump,
  type AudioWindowReader,
} from "./audio-stream-pump";
import {
  createIncrementalPeaks,
  type IncrementalPeakAccumulator,
} from "./incremental-peaks";
import { canUseSharedRingBuffer } from "./ring-buffer";
import type { AudioMetadata } from "./types";
import type {
  AudioPlaybackStatus,
  UseAudioPlaybackResult,
} from "./use-audio-playback";

/**
 * Stand-in for the engine when a consumer wants the waveform but no sound.
 * It accepts everything immediately, so the pump reads straight through the
 * source folding peaks as it goes, and no `AudioContext` is created.
 */
function createDiscardSink(sampleRate: number, channels: number) {
  return {
    sampleRate,
    channels,
    availableWrite: () => Number.MAX_SAFE_INTEGER,
    bufferedFrames: () => 0,
    push: (interleaved: Float32Array, offsetFrames = 0) =>
      Math.max(0, Math.floor(interleaved.length / channels) - offsetFrames),
    seek: () => undefined,
    markEnded: () => undefined,
  };
}

/** Re-anchor the pump when the engine clock drifts past this. */
const DRIFT_TOLERANCE_S = 0.25;
/** How often the waveform snapshot is refreshed while filling. */
const PEAK_REFRESH_MS = 400;

/** Everything the transport needs to describe a streamable source. */
export interface AudioStreamSource {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  readonly read: AudioWindowReader;
  readonly metadata?: AudioMetadata;
}

export interface UseAudioStreamPlaybackOptions {
  readonly trackId: string;
  readonly label?: string;
  readonly kind?: AudioSourceKind;
  /** `null` disables this hook entirely, for the buffered fallback. */
  readonly source: AudioStreamSource | null;
  readonly playback?: boolean;
  /**
   * Whether this transport owns the mixer row. Pass `false` when something
   * else already registers the same track id — otherwise both register it,
   * and the row churns as this transport activates and idles.
   * @default true
   */
  readonly registerRoster?: boolean;
}

export interface UseAudioStreamPlaybackResult extends UseAudioPlaybackResult {
  /**
   * False when this transport cannot run — no shared memory, or the engine
   * failed to start. The caller uses the buffered path instead.
   */
  readonly available: boolean;
}

export function useAudioStreamPlayback({
  trackId,
  label,
  kind = "pcm",
  source,
  playback = true,
  registerRoster = true,
}: UseAudioStreamPlaybackOptions): UseAudioStreamPlaybackResult {
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const seekEvent = useSeekEvent();

  // Constant for the page lifetime, so this never flips mid-session and
  // leaves half a graph behind.
  const supported = useMemo(() => canUseSharedRingBuffer(), []);

  const [status, setStatus] = useState<AudioPlaybackStatus>("idle");
  const [available, setAvailable] = useState(supported);
  const [waveformPeaks, setWaveformPeaks] =
    useState<UseAudioPlaybackResult["waveformPeaks"]>(null);

  const engineRef = useRef<AudioStreamEngine | null>(null);
  const pumpRef = useRef<AudioStreamPump | null>(null);
  const peaksRef = useRef<IncrementalPeakAccumulator | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  /** Media position the current ring generation started from. */
  const anchorSecRef = useRef(0);

  // Not gated on `playback`: a waveform-only consumer still streams, it
  // just has no audio graph behind it.
  const active = Boolean(source) && supported;

  // Build the transport. Keyed on the source identity so a new track tears
  // the old graph down rather than feeding two sources into one ring.
  useEffect(() => {
    if (!active || !source) {
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setWaveformPeaks(null);

    const accumulator = createIncrementalPeaks({
      channels: source.channels,
      sampleRate: source.sampleRate,
      totalFrames: Math.max(
        1,
        Math.round(source.durationSec * source.sampleRate),
      ),
    });
    peaksRef.current = accumulator;

    void (async () => {
      try {
        // Only an audible consumer builds a graph; browsers cap concurrent
        // AudioContexts per page, and one per waveform tile would exhaust
        // that budget for tracks nobody is listening to.
        const sink = playback
          ? await createAudioStreamEngine({
              channels: source.channels,
              sampleRate: source.sampleRate,
            })
          : createDiscardSink(source.sampleRate, source.channels);
        if (cancelled) {
          if ("dispose" in sink) void sink.dispose();
          return;
        }
        if ("dispose" in sink) {
          engineRef.current = sink;
          const gain = sink.audioContext.createGain();
          gain.gain.value = getEffectiveTrackVolume(store, trackId);
          sink.node.connect(gain);
          gain.connect(sink.audioContext.destination);
          gainRef.current = gain;
        }

        // Peaks are folded from the same windows playback consumes, so the
        // waveform costs no extra reads.
        const read: AudioWindowReader = async (startSec, endSec, signal) => {
          const window = await source.read(startSec, endSec, signal);
          if (window) {
            accumulator.add(
              window.samples,
              Math.round(startSec * source.sampleRate),
            );
          }
          return window;
        };

        pumpRef.current = createAudioStreamPump({
          engine: sink,
          read,
          durationSec: source.durationSec,
          onError: () => setStatus("error"),
        });

        anchorSecRef.current = getPlayhead(store);
        pumpRef.current.start(anchorSecRef.current);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        // No shared memory here: report unavailable so the caller falls back
        // rather than presenting an audio track that is silently mute.
        if (error instanceof SharedAudioUnavailableError) {
          setAvailable(false);
          setStatus("idle");
        } else {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      pumpRef.current?.stop();
      pumpRef.current = null;
      gainRef.current?.disconnect();
      gainRef.current = null;
      peaksRef.current = null;
      const engine = engineRef.current;
      engineRef.current = null;
      void engine?.dispose();
    };
  }, [active, playback, source, store, trackId]);

  // Waveform snapshots while the pyramid fills. Polled rather than pushed:
  // the accumulator is written from the read path, and re-rendering on every
  // window would thrash the canvas for no visible gain.
  useEffect(() => {
    if (status !== "ready") return undefined;
    const timer = setInterval(() => {
      const accumulator = peaksRef.current;
      if (accumulator?.hasData()) setWaveformPeaks(accumulator.pyramids());
    }, PEAK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status]);

  // Mixer roster. Registered only when this transport is used on its own —
  // `useMcapAudioStream` mounts it alongside `useAudioPlayback`, which
  // registers on `trackId` alone and so holds the row steady. Two owners
  // meant the row was unregistered and re-registered as this transport went
  // active and idle, which with demand gating is every mute and unmute.
  useEffect(() => {
    if (!registerRoster || !active || !playback || !trackId) return undefined;
    return registerAudioTrackImpl(store, {
      id: trackId,
      kind,
      label: label ?? trackId,
    });
  }, [active, kind, label, playback, registerRoster, store, trackId]);

  const seekTo = useCallback((timeSec: number) => {
    anchorSecRef.current = timeSec;
    pumpRef.current?.seek(timeSec);
  }, []);

  // Engine registration. `bufferState` is honest here, unlike the buffered
  // transport's constant "ready": a streaming track really can be waiting.
  useEffect(() => {
    if (!active || !playback || status !== "ready") return undefined;
    const stream: PlaybackStream = {
      id: trackId,
      blocking: false,
      bufferState: () =>
        (engineRef.current?.bufferedFrames() ?? 0) > 0 ? "ready" : "loading",
      onCommit: (time) => {
        const engine = engineRef.current;
        if (!engine) return;
        // The worklet's frame count is the only trustworthy position: it
        // stops advancing during starvation, where `currentTime` does not.
        const actual = anchorSecRef.current + engine.playedSeconds();
        if (Math.abs(actual - time) > DRIFT_TOLERANCE_S) seekTo(time);
      },
    };
    const unregister = registerStream(stream);
    const unsubscribe = subscribeStream(trackId);
    return () => {
      unsubscribe();
      unregister();
    };
  }, [
    active,
    playback,
    status,
    registerStream,
    subscribeStream,
    trackId,
    seekTo,
  ]);

  // Transport. Web Audio has no per-node pause, so the context is suspended
  // and resumed — this keeps the ring intact, which is the whole advantage
  // over tearing down a source node.
  useEffect(() => {
    if (!active || !playback || status !== "ready") return undefined;
    const engine = engineRef.current;
    if (!engine) return undefined;

    if (isPlaying) {
      if (isMasterMuteAtSessionDefault()) setMasterMuted(store, false);
      // Play is the user gesture browsers wait for before a context may
      // produce sound.
      void engine.audioContext.resume();
    } else {
      void engine.audioContext.suspend();
    }
    return undefined;
  }, [active, playback, status, isPlaying, store]);

  // Discontinuous jumps: scrub, step, loop wrap.
  useEffect(() => {
    if (!active || status !== "ready" || !seekEvent) return undefined;
    seekTo(seekEvent.time);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekEvent?.seq]);

  const effectiveVolume = useEffectiveTrackVolume(trackId);
  useEffect(() => {
    const gain = gainRef.current;
    if (gain) gain.gain.value = effectiveVolume;
  }, [effectiveVolume]);

  return useMemo(
    () => ({
      available,
      channels: source?.channels ?? 0,
      hasAudio: Boolean(source) && status !== "idle",
      metadata: source?.metadata ?? null,
      status,
      waveformPeaks,
    }),
    [available, source, status, waveformPeaks],
  );
}
