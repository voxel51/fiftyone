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
    const onLoaded = () => {
      if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    };
    if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
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
        for (let i = 0; i < v.buffered.length; i++) {
          if (t >= v.buffered.start(i) && t <= v.buffered.end(i)) return "ready";
        }
        // Video element is fetching but the target time isn't covered yet.
        return v.readyState >= 3 ? "ready" : "loading";
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
