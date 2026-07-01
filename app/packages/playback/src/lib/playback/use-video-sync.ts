import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, type RefObject } from "react";
import { isBufferingAtom, isPlayingAtom, seekEventAtom } from "./atoms";
import { usePlaybackStore } from "./playback-store-context";

/**
 * Bind an `<video>` element to the playback atoms. Three responsibilities:
 *
 * - `isPlayingAtom` → `v.play()` / `v.pause()`. When buffering
 *   (`isBufferingAtom = true`), the video stays paused even if
 *   `isPlayingAtom` is true. This is how non-video blocking streams
 *   (label fetches, etc.) backpressure the timeline: the engine sets
 *   `isBufferingAtom`, the video freezes, and the rest of the system
 *   waits for the data to land.
 * - `seekEventAtom` → `v.currentTime`. Explicit seeks (UI scrub, step
 *   actions, loop wrap) drive the video.
 * - `ended` → flip `isPlayingAtom` false so the bar's play button is
 *   correct after natural end-of-stream.
 *
 * This hook does **not** read the video's clock back into the
 * playhead. In the engine's default wallclock mode, the engine owns
 * the playhead and the video follows. For video-anchored playback,
 * pair this with the `useVfcClockSource` hook (in `video-annotation`)
 * which registers a `PlaybackClockSource` with the engine.
 *
 * Pass the ref of a `<video>` element. Every atom read/write and the
 * `store.sub` subscription below target the playback store explicitly
 * via `usePlaybackStore()` — we can't rely on Jotai's nearest-Provider
 * lookup because `<PlaybackProvider>` deliberately doesn't mount one
 * (see `playback-store-context.ts`).
 */
export function useVideoSync(
  videoRef: RefObject<HTMLVideoElement | null>,
): void {
  const store = usePlaybackStore();
  const isPlaying = useAtomValue(isPlayingAtom, { store });
  const isBuffering = useAtomValue(isBufferingAtom, { store });
  const setIsPlaying = useSetAtom(isPlayingAtom, { store });

  // play / pause / buffering. The buffering gate takes precedence:
  // while a blocking stream is loading, the video stays paused even
  // if `isPlayingAtom` is true. Pausing also stops vfc, which freezes
  // any registered video clock source — so labels-fetch-in-progress
  // can't be raced by a video that keeps advancing on its own.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    if (isPlaying && !isBuffering) {
      v.play().catch(() => {
        // Autoplay policy may reject — caller can show a click-to-play UI.
      });
    } else {
      v.pause();
    }
  }, [isPlaying, isBuffering, videoRef]);

  // Explicit seeks (UI scrub, step actions, loop wrap) come through
  // `seekEventAtom`. Drive the video element here.
  useEffect(() => {
    return store.sub(seekEventAtom, () => {
      const v = videoRef.current;
      if (!v) return;
      const ev = store.get(seekEventAtom);
      if (!ev) return;
      v.currentTime = ev.time;
    });
  }, [store, videoRef]);

  // Surface the video's natural end-of-stream as paused so the bar's
  // play button matches reality. `isPlayingAtom` normally drives the
  // video; here the video drove itself to a stop, so we have to push
  // the state back up.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onEnded = () => {
      v.pause();
      setIsPlaying(false);
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
    // setIsPlaying is a stable Jotai setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]);
}
