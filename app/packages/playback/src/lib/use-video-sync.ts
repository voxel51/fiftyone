import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, type RefObject } from "react";
import { currentTimeAtom, isPlayingAtom, playheadAtom } from "./playback-atoms";

/**
 * Seek tolerance in seconds. If the playhead and the video's currentTime
 * drift more than this, we re-sync the video. Lower than the typical
 * `timeupdate` event granularity so a normal play cycle never triggers
 * a sync (avoiding feedback loops with our own RAF updates).
 */
const SEEK_TOLERANCE_S = 0.15;

/**
 * Bidirectional sync between an HTMLVideoElement and the playback atoms.
 *
 * - `isPlayingAtom` drives `video.play()` / `video.pause()`.
 * - User scrubs (changes to `playheadAtom` that diverge from the video's
 *   currentTime) seek the video.
 * - The video's own `timeupdate` events update `playheadAtom` and
 *   `currentTimeAtom` so the rest of the UI follows the video's natural
 *   playback rate.
 *
 * Pass the ref of a `<video>` element. The hook reads the nearest
 * Jotai store from the surrounding `PlaybackProvider`.
 */
export function useVideoSync(
  videoRef: RefObject<HTMLVideoElement | null>
): void {
  const isPlaying = useAtomValue(isPlayingAtom);
  const setPlayhead = useSetAtom(playheadAtom);
  const setCurrentTime = useSetAtom(currentTimeAtom);
  const store = useStore();

  // play / pause
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    if (isPlaying) {
      v.play().catch(() => {
        // Autoplay policy may reject — caller can show a click-to-play UI.
      });
    } else {
      v.pause();
    }
  }, [isPlaying, videoRef]);

  // Subscribe to the playhead via the store (not useAtomValue) so this
  // effect doesn't tear down and re-run on every tick. When the playhead
  // changes for a reason OTHER than the video itself (a scrub), the video
  // is out of sync — seek it.
  useEffect(() => {
    return store.sub(playheadAtom, () => {
      const v = videoRef.current;
      if (!v) return;
      const target = store.get(playheadAtom);
      if (Math.abs(v.currentTime - target) > SEEK_TOLERANCE_S) {
        v.currentTime = target;
      }
    });
  }, [store, videoRef]);

  // Mirror the video's authoritative time into the atoms.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onTimeUpdate = () => {
      setPlayhead(v.currentTime);
      setCurrentTime(v.currentTime);
    };
    const onEnded = () => {
      // Video reached its end — surface that as paused so the bar's
      // play button is correct.
      v.pause();
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
    };
  }, [setPlayhead, setCurrentTime, videoRef]);
}
