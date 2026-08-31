import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlaybackStream } from "./types";
import { usePlayback } from "./PlaybackProvider";

/**
 * Maximum drift (sec) between the engine's target time and the video's
 * last-presented frame time before `bufferState` reports "loading".
 *
 * The engine's wallclock RAF can drift past the video's decoder pace
 * under stress (memory pressure, throttled tab, decoder starvation).
 * The bytes are in `buffered` and `currentTime` keeps incrementing
 * from the element's internal clock, but no new frame is being
 * painted — so the byte-level check says "ready" while the picture is
 * stale. Stalling closes the loop: engine pauses, decoder catches up,
 * `presented` returns, engine resumes.
 *
 * ~1.5 frames at 30fps. Tight because we measure presentation, not
 * bookkeeping. See {@link usePresentedMediaTime}.
 *
 * Not used when a `PlaybackClockSource` is registered (e.g. video-
 * anchored playback) — in that mode the engine reads time from the
 * source directly, so it can't drift past presentation.
 */
const VIDEO_DRIFT_TOLERANCE_S = 0.05;

/**
 * Registers a video element as a `PlaybackStream` with the surrounding
 * `PlaybackProvider`. The stream contributes:
 *
 * - `duration` — the engine's overall timeline length follows the
 *   video's metadata-reported duration. The provider doesn't need a
 *   fallback `duration` prop for the video to drive the clock.
 * - `bufferState` — "ready" if the time is inside one of the video's
 *   `buffered` ranges *and* the picture has been presented within
 *   `VIDEO_DRIFT_TOLERANCE_S` of the target; "loading" if the element
 *   is still fetching or the picture is behind; "missing" otherwise.
 *
 * Doesn't drive `play()` / `pause()` / scrubs — pair with `useVideoSync`
 * for that. Streams are "what data is there"; the sync hook is "what
 * the data does about it".
 *
 * `options.blocking` defaults to true: the engine's RAF won't advance
 * past a target the video hasn't caught up to. Pass `false` when a
 * `PlaybackClockSource` is going to drive the engine — the source is
 * already the authority on presentation time, so gating again on the
 * stream is redundant.
 *
 * Note on `blocking: false` without a clock source: the engine runs its
 * wallclock `dt` independently of the video, and nothing pulls them
 * back into sync (no `bufferState` gating, no `timeupdate` mirror).
 * They drift sub-percent over long sessions. Acceptable for decorative
 * video paired with another authoritative timeline; not acceptable for
 * overlay-on-video. If sync matters, register a clock source.
 */
export function useVideoStream(
  id: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  options: { blocking?: boolean } = {},
): void {
  const blocking = options.blocking ?? true;
  const { registerStream } = usePlayback();
  const [duration, setDuration] = useState(0);
  // The presented-frame ref only feeds the drift check inside
  // `bufferState`, which the engine never calls on a non-blocking
  // stream. Skip the vfc loop entirely in that mode so we don't
  // duplicate it with `useVfcClockSource` (which mounts its own loop
  // on the same element).
  const presentedMediaTimeRef = usePresentedMediaTime(videoRef, blocking);

  // Track the video's reported duration. The stream isn't registered until
  // metadata loads — `durationAtom` stays at the provider's fallback (0 by
  // default) until the video is ready.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const apply = () => {
      if (isFiniteDuration(v.duration)) setDuration(v.duration);
    };
    apply();
    v.addEventListener("loadedmetadata", apply);
    // `durationchange` also covers live streams / MSE / adaptive
    // manifests where duration is refined after the initial metadata.
    v.addEventListener("durationchange", apply);
    return () => {
      v.removeEventListener("loadedmetadata", apply);
      v.removeEventListener("durationchange", apply);
    };
  }, [videoRef]);

  // Register / re-register the stream when its duration becomes known.
  useEffect(() => {
    if (duration <= 0) return undefined;
    const stream: PlaybackStream = {
      id,
      blocking,
      duration,
      bufferState: (t) => {
        const v = videoRef.current;
        if (!v) return "missing";

        // Decoder can't promise the next displayable frame — stall the
        // engine so it doesn't commit a playhead the on-screen video
        // isn't actually at. Covers seeks (readyState drops while the
        // element resyncs) and decoder starvation.
        if (v.readyState < v.HAVE_FUTURE_DATA) return "loading";

        // Per HTML spec, `TimeRanges.end(i)` is the first moment NOT
        // buffered — use an exclusive upper bound.
        let inBuffered = false;
        for (let i = 0; i < v.buffered.length; i++) {
          if (t >= v.buffered.start(i) && t < v.buffered.end(i)) {
            inBuffered = true;
            break;
          }
        }
        if (!inBuffered) return "loading";

        // Compare against the most recently *presented* frame time —
        // `currentTime` keeps incrementing from the element's internal
        // clock even when no frame is being painted, so it can't be
        // trusted as a sync signal. `presentedMediaTimeRef` is updated
        // from `requestVideoFrameCallback`, which fires exactly when a
        // new frame reaches the compositor. Falls back to `currentTime`
        // before the first vfc tick lands or on browsers without
        // support.
        const presented = presentedMediaTimeRef.current ?? v.currentTime;
        if (Math.abs(t - presented) > VIDEO_DRIFT_TOLERANCE_S) return "loading";
        return "ready";
      },
      bufferedRanges: () => {
        const v = videoRef.current;
        if (!v) return [];
        const ranges: Array<[number, number]> = [];
        for (let i = 0; i < v.buffered.length; i++) {
          ranges.push([v.buffered.start(i), v.buffered.end(i)]);
        }
        return ranges;
      },
    };
    return registerStream(stream);
  }, [id, duration, blocking, registerStream, videoRef]);
}

function isFiniteDuration(d: number): boolean {
  return Number.isFinite(d) && d > 0;
}

/**
 * Tracks the `mediaTime` of the most recently presented video frame.
 *
 * `HTMLVideoElement.requestVideoFrameCallback` fires once per frame
 * that actually reaches the compositor — unlike `currentTime`, which
 * the element keeps advancing from its internal clock even when the
 * decoder is starved and no frame is being painted. Comparing the
 * engine's target time against `presentedMediaTimeRef` therefore
 * measures *visual* lag, which is what we want when deciding whether
 * to stall the engine to keep streams in sync visually.
 *
 * Falls back to `null` on browsers without `requestVideoFrameCallback`
 * (legacy Safari, Firefox before 132); consumers should fall back to
 * `currentTime` in that case.
 *
 * Exported so callers outside of `useVideoStream` (e.g. a video-
 * anchored `PlaybackClockSource`) can read the same signal. Each call
 * site mounts its own vfc loop — pass `enabled: false` from callers
 * that don't need the ref so we don't run a loop whose output goes
 * unread.
 */
export function usePresentedMediaTime(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled = true,
): RefObject<number | null> {
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const v = videoRef.current;
    if (!v) {
      return undefined;
    }

    // `requestVideoFrameCallback` exists on HTMLVideoElement but isn't
    // in lib.dom.d.ts on older TS targets — cast through to call it.
    type VFC = (
      cb: (now: number, metadata: { mediaTime: number }) => void,
    ) => number;
    const rvfc = (v as unknown as { requestVideoFrameCallback?: VFC })
      .requestVideoFrameCallback;
    const cvfc = (
      v as unknown as { cancelVideoFrameCallback?: (handle: number) => void }
    ).cancelVideoFrameCallback;

    if (typeof rvfc !== "function") {
      return undefined;
    }

    let cancelled = false;
    let handle: number | null = null;

    const onFrame = (_now: number, metadata: { mediaTime: number }) => {
      if (cancelled) {
        return;
      }

      ref.current = metadata.mediaTime;
      handle = rvfc.call(v, onFrame);
    };
    handle = rvfc.call(v, onFrame);

    return () => {
      cancelled = true;
      if (handle != null && typeof cvfc === "function") {
        cvfc.call(v, handle);
      }

      ref.current = null;
    };
  }, [videoRef, enabled]);

  return ref;
}
