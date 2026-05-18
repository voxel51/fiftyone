import { useEffect, useState, type RefObject } from "react";
import type { PlaybackStream } from "./types";
import { usePlayback } from "./PlaybackProvider";

/**
 * Registers a video element as a `PlaybackStream` with the surrounding
 * `PlaybackProvider`. The stream contributes:
 *
 * - `duration` — the engine's overall timeline length follows the video's
 *   metadata-reported duration. The provider doesn't need a fallback
 *   `duration` prop for the video to drive the clock.
 * - `bufferState` — "ready" if the time is inside one of the video's
 *   `buffered` ranges, "loading" if the element is still fetching but
 *   isn't ready at the target time, "missing" otherwise. The engine
 *   stalls the clock while the video is buffering at the target time.
 *
 * Doesn't drive `play()` / `pause()` / scrubs — pair with `useVideoSync`
 * for that. Streams are "what data is there"; the sync hook is "what
 * the data does about it".
 */
export function useVideoStream(
  id: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  options: { blocking?: boolean } = {}
): void {
  const { registerStream } = usePlayback();
  const [duration, setDuration] = useState(0);

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
      blocking: options.blocking ?? true,
      duration,
      bufferState: (t) => {
        const v = videoRef.current;
        if (!v) return "missing";
        // Per HTML spec, `TimeRanges.end(i)` is the first moment NOT
        // buffered — use an exclusive upper bound.
        for (let i = 0; i < v.buffered.length; i++) {
          if (t >= v.buffered.start(i) && t < v.buffered.end(i)) return "ready";
        }
        // `readyState >= 3` only guarantees playback can proceed from
        // `currentTime`, not that an arbitrary `t` is buffered — return
        // "loading" so the engine stalls until the target range is fetched.
        return "loading";
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
  }, [id, duration, options.blocking, registerStream, videoRef]);
}

function isFiniteDuration(d: number): boolean {
  return Number.isFinite(d) && d > 0;
}
