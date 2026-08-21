import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  audioMutedAtom,
  audioVolumeAtom,
  isBufferingAtom,
  isPlayingAtom,
  playheadAtom,
  seekEventAtom,
  speedAtom,
} from "./atoms";
import { usePlayback } from "./PlaybackProvider";
import { usePlaybackStore } from "./playback-store-context";
import {
  bumpStreamRangesVersion,
  getAudioAvailable,
  setAudioAvailable,
  setAudioMuted,
} from "./store-access";
import type { BufferReadiness, PlaybackStream } from "./types";

/**
 * Maximum drift (sec) between the engine's committed time and the audio
 * element's clock before `onCommit` snaps `currentTime` back onto the
 * playhead. The engine's wallclock RAF and the audio hardware clock run
 * at fractionally different rates, so drift accumulates slowly; each
 * correction is an audible seam, so the tolerance is loose enough that
 * corrections stay rare during healthy playback and tight enough that
 * lip-sync never visibly breaks (~4-5 frames at 30fps).
 */
const AUDIO_DRIFT_TOLERANCE_S = 0.15;

/**
 * Times within this many seconds of (or past) the audio's own end count as
 * "ready" — there is nothing left to play, so the audio stream must not
 * gate the barrier when the overall timeline outlives its audio track.
 */
const AUDIO_END_EPSILON_S = 0.05;

/** Plain-data snapshot of an audio element's buffer state, for pure logic. */
export interface AudioBufferSnapshot {
  /** `HTMLMediaElement.readyState` (0–4). */
  readyState: number;
  /** Buffered ranges as [start, end) pairs, seconds. */
  buffered: ReadonlyArray<readonly [number, number]>;
  /** Media duration in seconds, or NaN before metadata loads. */
  duration: number;
  /** Whether the element holds a fatal `MediaError` (`element.error`). */
  errored?: boolean;
}

/**
 * Readiness of an audio element for the engine's barrier at `time`.
 *
 * Never returns "missing": a media element buffers around its own
 * `currentTime`, which the seek-event binding keeps on the playhead, so
 * there is no explicit prefetch to request — "loading" tells the engine
 * a fetch is effectively always in flight.
 */
export function audioBufferReadiness(
  time: number,
  snapshot: AudioBufferSnapshot,
): BufferReadiness {
  // A fatal media error means no further data will ever arrive —
  // "loading" would hold the barrier forever, so a dead fetch yields to
  // silence and the timeline plays on without sound.
  if (snapshot.errored) {
    return "ready";
  }

  // Past the audio's own end there is nothing to play — silence is ready.
  if (
    Number.isFinite(snapshot.duration) &&
    time >= snapshot.duration - AUDIO_END_EPSILON_S
  ) {
    return "ready";
  }

  // HAVE_FUTURE_DATA — the element can't promise uninterrupted playback
  // below this, so stall the barrier until it can.
  if (snapshot.readyState < 3) {
    return "loading";
  }

  // Per HTML spec, `TimeRanges.end(i)` is the first moment NOT buffered —
  // use an exclusive upper bound.
  for (const [start, end] of snapshot.buffered) {
    if (time >= start && time < end) {
      return "ready";
    }
  }
  return "loading";
}

/**
 * Whether `onCommit` should snap the audio clock onto the engine's
 * committed time. Only during active element playback: while paused the
 * seek-event binding owns `currentTime` (chasing mid-scrub would fight the
 * debounced seek and thrash the decoder), and while seeking the element is
 * already moving to a commanded position.
 */
export function shouldChaseAudioClock(args: {
  time: number;
  elementTime: number;
  paused: boolean;
  seeking: boolean;
  duration: number;
}): boolean {
  if (args.paused || args.seeking) {
    return false;
  }
  if (
    Number.isFinite(args.duration) &&
    args.time >= args.duration - AUDIO_END_EPSILON_S
  ) {
    return false;
  }
  return Math.abs(args.elementTime - args.time) > AUDIO_DRIFT_TOLERANCE_S;
}

/**
 * Best-effort detection of whether the element's media actually contains
 * an audio track. Every signal here is non-standard, so `null` means
 * "unknown" — integrators with a demuxer-level signal (e.g. mp4box's
 * track table) should prefer that and pass `enabled: false` when absent.
 */
export function detectElementHasAudio(
  element: HTMLAudioElement,
): boolean | null {
  const probed = element as HTMLAudioElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };
  if (typeof probed.mozHasAudio === "boolean") {
    return probed.mozHasAudio;
  }
  if (probed.audioTracks && typeof probed.audioTracks.length === "number") {
    return probed.audioTracks.length > 0;
  }
  if (typeof probed.webkitAudioDecodedByteCount === "number") {
    // Zero before any decode has happened is inconclusive, not a "no".
    return probed.webkitAudioDecodedByteCount > 0 ? true : null;
  }
  return null;
}

/**
 * Drives timeline audio from a hidden `HTMLAudioElement` owned by this
 * hook. Registers the element as a **blocking** `PlaybackStream` — the
 * engine's barrier holds the playhead until sound is buffered at the
 * target time, so the picture never runs ahead of audio — but the stream
 * is only *subscribed* while `enabled` and unmuted. Muted or audio-less
 * timelines pay zero playback cost: the engine skips dormant streams
 * entirely.
 *
 * The element follows the engine, never the reverse:
 * - `isPlayingAtom` / `isBufferingAtom` → `play()` / `pause()`, with the
 *   buffering gate taking precedence (mirrors `useVideoSync`).
 * - `seekEventAtom` → `currentTime` (scrubs, steps, loop wrap).
 * - `speedAtom` → `playbackRate`, pitch-preserved.
 * - `audioVolumeAtom` / `audioMutedAtom` → `volume` / `muted`.
 * - `onCommit` drift-chase re-anchors `currentTime` when the element's
 *   hardware clock strays from the committed playhead.
 *
 * The stream deliberately contributes no `duration`: the timeline's
 * length belongs to the picture (frames) stream, and audio that reports a
 * fractionally longer container duration must not stretch it. Playhead
 * positions past the audio's own end are always "ready" (silence).
 *
 * Publishes `audioAvailableAtom` for the volume UI and returns the
 * best-effort `hasAudio` signal (`null` = unknown); prefer a demuxer-level
 * signal via `enabled` when available.
 */
export function useAudioStream(
  id: string,
  src: string,
  options: { enabled?: boolean } = {},
): { hasAudio: boolean | null } {
  const enabled = options.enabled ?? true;
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const [metadataReady, setMetadataReady] = useState(false);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);

  // Element lifecycle. The element never enters the DOM — audio needs no
  // rendering surface — so creation/teardown is purely imperative.
  useEffect(() => {
    if (!enabled || !src) {
      return undefined;
    }

    const element = new Audio();
    element.preload = "auto";
    element.src = src;
    // Pitch-preserve across speed changes; set once — playbackRate is
    // applied reactively below.
    element.preservesPitch = true;
    elementRef.current = element;

    const onLoadedMetadata = () => setMetadataReady(true);
    const probeHasAudio = () => {
      const detected = detectElementHasAudio(element);
      if (detected !== null) {
        setHasAudio(detected);
        element.removeEventListener("loadeddata", probeHasAudio);
        element.removeEventListener("timeupdate", probeHasAudio);
      }
    };
    // Wake a barrier-held engine — it only re-evaluates pending playback
    // on buffered-ranges signals. "error" is wired to the same signal: a
    // fatal error flips readiness to "ready" (see audioBufferReadiness),
    // and the engine must re-poll to see it and release the barrier.
    const wakeEngine = () => bumpStreamRangesVersion(store);
    const onError = () => {
      // `element.error` stays null for non-fatal error events
      if (element.error) {
        setAudioAvailable(store, "error");
      }
      wakeEngine();
    };

    element.addEventListener("loadedmetadata", onLoadedMetadata);
    element.addEventListener("loadeddata", probeHasAudio);
    // `webkitAudioDecodedByteCount` stays 0 until decode starts, so keep
    // probing on timeupdate until a conclusive answer arrives.
    element.addEventListener("timeupdate", probeHasAudio);
    element.addEventListener("progress", wakeEngine);
    element.addEventListener("canplay", wakeEngine);
    element.addEventListener("canplaythrough", wakeEngine);
    element.addEventListener("error", onError);

    return () => {
      element.removeEventListener("loadedmetadata", onLoadedMetadata);
      element.removeEventListener("loadeddata", probeHasAudio);
      element.removeEventListener("timeupdate", probeHasAudio);
      element.removeEventListener("progress", wakeEngine);
      element.removeEventListener("canplay", wakeEngine);
      element.removeEventListener("canplaythrough", wakeEngine);
      element.removeEventListener("error", onError);
      element.pause();
      // Release the media resource — dropping the reference alone leaves
      // the fetch/decoder alive until GC.
      element.removeAttribute("src");
      element.load();
      elementRef.current = null;
      // An error can land before metadata, when the availability effect
      // below never ran — its cleanup can't clear the status, so the
      // element's own teardown must.
      if (getAudioAvailable(store) === "error") {
        setAudioAvailable(store, "unavailable");
      }
      setMetadataReady(false);
      setHasAudio(null);
    };
  }, [enabled, src, store]);

  // Register the blocking stream once the element can answer readiness
  // questions. Registration is independent of mute — dormancy (the
  // subscription below) is what keeps a muted stream out of the barrier.
  useEffect(() => {
    if (!enabled || !metadataReady) {
      return undefined;
    }
    const stream: PlaybackStream = {
      id,
      blocking: true,
      bufferState: (time) => {
        const element = elementRef.current;
        if (!element) return "missing";
        return audioBufferReadiness(time, snapshotElement(element));
      },
      onCommit: (time) => {
        const element = elementRef.current;
        if (!element) return;
        if (
          shouldChaseAudioClock({
            time,
            elementTime: element.currentTime,
            paused: element.paused,
            seeking: element.seeking,
            duration: element.duration,
          })
        ) {
          element.currentTime = time;
        }
      },
      bufferedRanges: () => {
        const element = elementRef.current;
        if (!element) return [];
        const ranges: Array<[number, number]> = [];
        for (let i = 0; i < element.buffered.length; i++) {
          ranges.push([element.buffered.start(i), element.buffered.end(i)]);
        }
        return ranges;
      },
    };
    return registerStream(stream);
  }, [enabled, metadataReady, id, registerStream]);

  // Availability for the volume UI: a playable element exists and there
  // is no conclusive "no audio track" verdict.
  const available = enabled && metadataReady && hasAudio !== false;
  useEffect(() => {
    if (!available) {
      return undefined;
    }
    setAudioAvailable(store, "available");
    return () => setAudioAvailable(store, "unavailable");
  }, [available, store]);

  // Activation: subscribed (and therefore barrier-gating) only while the
  // sound is actually wanted. `hasAudio === false` is a conclusive "no
  // audio track" — never gate on silence.
  const muted = useAtomValue(audioMutedAtom, { store });
  const active = enabled && !muted && hasAudio !== false;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    // The element's clock only follows seek events and the drift-chase,
    // neither of which runs while the stream is dormant — a stream
    // activated mid-play sits at a stale position. Anchor it to the
    // playhead before the barrier asks for readiness there.
    const element = elementRef.current;
    if (element) {
      const end = Number.isFinite(element.duration)
        ? element.duration
        : Number.POSITIVE_INFINITY;
      element.currentTime = Math.min(Math.max(store.get(playheadAtom), 0), end);
    }
    return subscribeStream(id);
  }, [active, id, subscribeStream, store]);

  // Transport: play/pause follows the engine, buffering gate first —
  // while any blocking stream is loading the audio must freeze with the
  // rest of the timeline.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }

    const apply = () => {
      const shouldPlay =
        active && store.get(isPlayingAtom) && !store.get(isBufferingAtom);
      if (shouldPlay && element.paused) {
        element.play().catch((error: unknown) => {
          // A pause() interrupting the pending play — the buffering gate
          // does this routinely — rejects with AbortError; the isBuffering
          // subscription re-issues play() when the gate clears. Only a
          // genuine autoplay-policy denial reflects back into the UI: the
          // next unmute is a user gesture, which satisfies the policy.
          if ((error as DOMException | null)?.name === "NotAllowedError") {
            setAudioMuted(store, true);
          }
        });
      } else if (!shouldPlay && !element.paused) {
        element.pause();
      }
    };

    apply();
    const unsubs = [
      store.sub(isPlayingAtom, apply),
      store.sub(isBufferingAtom, apply),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
      element.pause();
    };
  }, [active, metadataReady, store]);

  // Discontinuous jumps (scrub, step, loop wrap) command the element
  // directly. The drift-chase never runs while paused, so this is the
  // only writer of `currentTime` outside active playback.
  useEffect(() => {
    return store.sub(seekEventAtom, () => {
      const element = elementRef.current;
      const event = store.get(seekEventAtom);
      if (!element || !event) return;
      const end = Number.isFinite(element.duration)
        ? element.duration
        : Number.POSITIVE_INFINITY;
      element.currentTime = Math.min(Math.max(event.time, 0), end);
    });
  }, [store]);

  // Speed, volume, mute — applied straight to the element. When the
  // engine runs dt-driven (the audio case), speed lives in the tick's dt;
  // the element's playbackRate must match or the chase fights it.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }
    const apply = () => {
      element.playbackRate = store.get(speedAtom);
      element.volume = store.get(audioVolumeAtom);
      element.muted = store.get(audioMutedAtom);
    };
    apply();
    const unsubs = [
      store.sub(speedAtom, apply),
      store.sub(audioVolumeAtom, apply),
      store.sub(audioMutedAtom, apply),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [metadataReady, store]);

  return { hasAudio };
}

function snapshotElement(element: HTMLAudioElement): AudioBufferSnapshot {
  const buffered: Array<[number, number]> = [];
  for (let i = 0; i < element.buffered.length; i++) {
    buffered.push([element.buffered.start(i), element.buffered.end(i)]);
  }
  return {
    readyState: element.readyState,
    buffered,
    duration: element.duration,
    errored: element.error !== null,
  };
}
