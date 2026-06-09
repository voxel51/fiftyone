import { useEffect, type RefObject } from "react";
import { usePlayback } from "../../../playback/src/lib/playback/PlaybackProvider";
import { usePresentedMediaTime } from "../../../playback/src/lib/playback/use-video-stream";

/**
 * Register a `<video>` element's vfc-reported presentation time as
 * the playback engine's clock source.
 *
 * This is the video-annotation opt-in into video-anchored playback.
 * The default engine model — wallclock RAF + barrier sync over
 * blocking streams — is the right design for label-only timelines,
 * image sequences, sensor data, and multi-stream coordinated
 * playback. But when a single `<video>` is the visual ground truth
 * for the timeline (one camera, one annotation pass), letting that
 * video's actual presentation time drive the engine avoids the
 * two-clock race between wallclock and the video's decoder pace.
 *
 * The clock source reads from a vfc-driven ref:
 * `requestVideoFrameCallback` fires once per frame the compositor
 * actually paints, so its `mediaTime` is exactly where the picture
 * is. The engine reads that each tick and commits at it.
 *
 * Returns `null` before the first vfc tick lands; the engine
 * gracefully falls back to its dt advance for that pre-first-frame
 * window. That's typically a single tick during initial decode and
 * doesn't matter.
 *
 * When you use this hook, also pass `blocking: false` to the
 * corresponding `useVideoStream` call — the clock source is already
 * the authority on presentation time, so the bufferState drift check
 * has nothing to add and would just produce spurious stalls.
 *
 * Multi-video extension: this is single-source. For coordinated
 * playback across N videos, write a hook that combines
 * multiple `presentedMediaTimeRef`s into one `read()` (typically
 * via `Math.min` across non-null refs so the engine waits on the
 * slowest video).
 */
export function useVfcClockSource(
  videoRef: RefObject<HTMLVideoElement | null>
): void {
  const { setClockSource } = usePlayback();
  const presentedMediaTimeRef = usePresentedMediaTime(videoRef);

  useEffect(() => {
    return setClockSource({
      read: () => presentedMediaTimeRef.current,
    });
  }, [presentedMediaTimeRef, setClockSource]);
}
