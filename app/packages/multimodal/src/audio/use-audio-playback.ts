// ---------------------------------------------------------------------------
// Format-neutral audio playback.
//
// Owns everything between "decoded PCM" and "audible, mixable, drawable":
// the Web Audio graph, engine transport/registration, the per-channel peak
// pyramids, and roster/availability publication for the mixer UI.
//
// It knows nothing about MCAP, Foxglove, or any container — a caller
// supplies an `AudioLoader` returning `PcmAudioData`. An MCAP topic, a
// plain .wav fetch, or a test double are all equally valid sources, which
// is what lets a non-MCAP audio dataset reuse this whole path.
//
// The loader is called once for the source's full extent, so memory scales
// with recording length. This is the FALLBACK transport: prefer
// `useAudioStreamPlayback`, which pages windowed reads through a bounded
// ring. This path stays for contexts where streaming cannot run (no
// `SharedArrayBuffer` off cross-origin isolation) and becomes deletable
// once a port-transfer transport covers them.
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
import { buildChannelPeakPyramids, type PeakPyramid } from "./peak-pyramid";
import type { AudioLoader, AudioMetadata } from "./types";

/** Tolerance before the audio clock is re-anchored to the engine clock. */
const DRIFT_TOLERANCE_S = 0.15;

export type AudioPlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

export interface UseAudioPlaybackResult {
  /** One pyramid per channel (L, R, …) for waveform rendering. */
  readonly waveformPeaks: readonly PeakPyramid[] | null;
  readonly hasAudio: boolean;
  readonly status: AudioPlaybackStatus;
  readonly metadata: AudioMetadata | null;
  readonly channels: number;
}

export interface UseAudioPlaybackOptions {
  /** Stable id, shared with the engine stream and the mixer roster. */
  readonly trackId: string;
  /** Display name for the mixer row and tile header. */
  readonly label?: string;
  readonly kind?: AudioSourceKind;
  /** Loads the source's PCM. Must be referentially stable (memoized). */
  readonly load: AudioLoader | null;
  /**
   * Whether this instance owns audible playback. Exactly ONE mounted
   * instance per track may — a second would build a duplicate audio graph
   * for the same track, doubling the signal and exhausting the browser's
   * per-page AudioContext budget. Views that only draw the waveform pass
   * `false`.
   * @default true
   */
  readonly playback?: boolean;
}

export function useAudioPlayback({
  trackId,
  label,
  kind = "pcm",
  load,
  playback = true,
}: UseAudioPlaybackOptions): UseAudioPlaybackResult {
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const seekEvent = useSeekEvent();

  const [status, setStatus] = useState<AudioPlaybackStatus>("idle");
  const [waveformPeaks, setWaveformPeaks] = useState<
    readonly PeakPyramid[] | null
  >(null);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [channels, setChannels] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const gainConnectedRef = useRef(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  // Web Audio has no true pause — `AudioBufferSourceNode` is one-shot.
  // "Paused" is modeled as no live source node; resuming creates a fresh
  // one at the current playhead offset. Holding
  // `contextTimeAtStart - engineTimeAtStart` lets `onCommit` detect drift
  // without re-reading the clock every frame.
  const startOffsetRef = useRef<{
    contextTime: number;
    engineTime: number;
  } | null>(null);

  // Stable callbacks: the transport effects below depend on these, so a
  // per-render identity would either re-run them (restarting playback on
  // every render) or force a stale closure to be captured.
  const stopPlayback = useCallback((): void => {
    const source = sourceNodeRef.current;
    sourceNodeRef.current = null;
    startOffsetRef.current = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // `stop()` throws on a node that was never started; the desired end
      // state is the same either way.
    }
    source.disconnect();
  }, []);

  const ensureAudioGraph = useCallback((): {
    audioContext: AudioContext;
    gain: GainNode;
  } | null => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return null;
    // A context constructed outside a user gesture starts suspended and is
    // silent until resumed; play is the gesture that permits this.
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    const gain =
      gainNodeRef.current ?? (gainNodeRef.current = audioContext.createGain());
    gain.gain.value = getEffectiveTrackVolume(store, trackId);
    // Tracked explicitly: `numberOfOutputs` is a node-type constant, not a
    // live connection count, so it can't answer "am I connected?".
    if (!gainConnectedRef.current) {
      gain.connect(audioContext.destination);
      gainConnectedRef.current = true;
    }
    return { audioContext, gain };
  }, [store, trackId]);

  const startPlayback = useCallback(
    (time: number): void => {
      const buffer = audioBufferRef.current;
      const graph = ensureAudioGraph();
      if (!buffer || !graph) return;
      stopPlayback();
      const { audioContext, gain } = graph;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(0, Math.min(Math.max(time, 0), buffer.duration));
      sourceNodeRef.current = source;
      startOffsetRef.current = {
        contextTime: audioContext.currentTime,
        engineTime: time,
      };
    },
    [ensureAudioGraph, stopPlayback],
  );

  // Load + prepare. One pass: PCM -> per-channel peaks -> AudioBuffer.
  useEffect(() => {
    if (!load) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    // Clear the previous source before loading the next: keeping its peaks
    // and metadata would draw the old waveform (and report the old rate)
    // under the new track's label until the new load resolved.
    setStatus("loading");
    setWaveformPeaks(null);
    setMetadata(null);
    setChannels(0);
    setHasAudio(false);

    void (async () => {
      const result = await load(controller.signal);
      if (cancelled) return;

      if (!result.ok) {
        setHasAudio(result.reason !== "empty");
        setStatus(result.reason === "empty" ? "idle" : result.reason);
        return;
      }

      const { samples, sampleRate, channels: channelCount } = result.data;
      setWaveformPeaks(
        buildChannelPeakPyramids(samples, {
          channels: channelCount,
          sampleRate,
        }),
      );
      setChannels(channelCount);
      setMetadata(
        result.metadata ?? {
          channels: channelCount,
          durationSec: samples.length / Math.max(1, channelCount) / sampleRate,
          sampleRate,
        },
      );
      setHasAudio(true);

      // Waveform-only consumers stop here: no AudioContext, no engine
      // registration. Status still reaches "ready" so their UI is honest.
      if (!playback) {
        setStatus("ready");
        return;
      }

      try {
        const AudioContextCtor =
          typeof window !== "undefined"
            ? (window.AudioContext ??
              (
                window as unknown as {
                  webkitAudioContext?: typeof AudioContext;
                }
              ).webkitAudioContext)
            : undefined;
        if (!AudioContextCtor) {
          setStatus("unsupported");
          return;
        }
        const audioContext = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = audioContext;
        const frames = Math.max(
          1,
          Math.floor(samples.length / Math.max(1, channelCount)),
        );
        const buffer = audioContext.createBuffer(
          Math.max(1, channelCount),
          frames,
          sampleRate,
        );
        // Interleaved -> planar, the layout AudioBuffer wants.
        for (let channel = 0; channel < channelCount; channel++) {
          const planar = buffer.getChannelData(channel);
          for (let i = 0; i < planar.length; i++) {
            planar[i] = samples[i * channelCount + channel] ?? 0;
          }
        }
        audioBufferRef.current = buffer;
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load, playback, trackId]);

  // Mixer roster. Registered as soon as a track id exists, NOT gated on a
  // successful decode: a source that fails to decode should still appear
  // in the mixer rather than vanishing without explanation.
  useEffect(() => {
    if (!trackId) return undefined;
    return registerAudioTrackImpl(store, {
      id: trackId,
      kind,
      label: label ?? trackId,
    });
  }, [store, trackId, label, kind]);

  // NOTE: master availability is deliberately NOT written here. It is a
  // single shared flag, so writing it per instance meant the first track to
  // unmount hid the volume control while other tracks were still playing.
  // `useAudio()` derives availability from the track roster instead, which
  // is already reference-counted by register/unregister above.

  // Engine registration. Fully buffered by "ready", so it never blocks the
  // barrier (`blocking: false`).
  useEffect(() => {
    if (!playback || status !== "ready" || !audioBufferRef.current) {
      return undefined;
    }
    const stream: PlaybackStream = {
      id: trackId,
      blocking: false,
      bufferState: () => "ready",
      onCommit: (time) => {
        const started = startOffsetRef.current;
        const audioContext = audioContextRef.current;
        if (!started || !audioContext) return;
        const expected =
          started.engineTime + (audioContext.currentTime - started.contextTime);
        if (Math.abs(expected - time) > DRIFT_TOLERANCE_S) {
          startPlayback(time);
        }
      },
    };
    const unregister = registerStream(stream);
    const unsubscribe = subscribeStream(trackId);
    return () => {
      unsubscribe();
      unregister();
      stopPlayback();
    };
  }, [
    playback,
    status,
    registerStream,
    subscribeStream,
    trackId,
    startPlayback,
    stopPlayback,
  ]);

  // Transport.
  useEffect(() => {
    if (!playback || status !== "ready") return undefined;
    if (isPlaying) {
      // Master mute starts on every session to satisfy browser autoplay
      // policy — pressing play is precisely the gesture it waits for. A
      // viewer who muted deliberately has a stored value and is never
      // overridden.
      if (isMasterMuteAtSessionDefault()) {
        setMasterMuted(store, false);
      }
      startPlayback(getPlayhead(store));
    } else {
      stopPlayback();
    }
    return undefined;
  }, [playback, status, isPlaying, store, startPlayback, stopPlayback]);

  // Discontinuous jumps (scrub, step, loop wrap) restart from the new
  // position while playing; a paused seek waits for the next play.
  useEffect(() => {
    if (!playback || status !== "ready" || !isPlaying || !seekEvent) {
      return undefined;
    }
    startPlayback(seekEvent.time);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekEvent?.seq]);

  // Volume/mute apply live without restarting playback.
  const effectiveVolume = useEffectiveTrackVolume(trackId);
  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) gain.gain.value = effectiveVolume;
  }, [effectiveVolume]);

  // Release the context on unmount. Browsers cap concurrent AudioContexts
  // per page; leaking them eventually makes construction fail, which
  // presents as unexplained silence.
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
    // `stopPlayback` is `useCallback(…, [])`, so its identity is stable and
    // listing it cannot cause this teardown to run before unmount.
    [stopPlayback],
  );

  return useMemo(
    () => ({ channels, hasAudio, metadata, status, waveformPeaks }),
    [channels, hasAudio, metadata, status, waveformPeaks],
  );
}
