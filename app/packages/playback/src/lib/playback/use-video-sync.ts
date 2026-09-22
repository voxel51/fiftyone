import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, type RefObject } from "react";
import {
  isBufferingAtom,
  isPlayingAtom,
  seekEventAtom,
  speedAtom,
} from "./atoms";
import { usePlaybackStore } from "./playback-store-context";
import { concedeMasterMuteToAutoplayPolicy } from "./store-access";

/**
 * Bind an `<video>` element to the playback atoms. Its responsibilities:
 *
 * - `isPlayingAtom` → `v.play()` / `v.pause()`. When buffering
 *   (`isBufferingAtom = true`), the video stays paused even if
 *   `isPlayingAtom` is true. This is how non-video blocking streams
 *   (label fetches, etc.) backpressure the timeline: the engine sets
 *   `isBufferingAtom`, the video freezes, and the rest of the system
 *   waits for the data to land.
 * - `seekEventAtom` → `v.currentTime`. Explicit seeks (UI scrub, step
 *   actions, loop wrap) drive the video.
 * - `speedAtom` → `v.playbackRate`. With a clock source registered the
 *   engine's `dt` arithmetic isn't running, so the element's rate is the
 *   only place speed can be applied.
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
    if (!isPlaying || isBuffering) {
      v.pause();
      return undefined;
    }

    // The retry below settles asynchronously, so it has to re-ask whether
    // playing is still wanted. Between the refusal and the rejection the
    // engine's barrier may have raised `isBufferingAtom` (routine at the
    // start of playback, while a blocking stream loads) or the viewer may
    // have paused — and with `useVfcClockSource` this element IS the clock,
    // so starting it anyway would advance the playhead past a barrier that
    // is meant to be holding it.
    let cancelled = false;

    v.play().catch((error: unknown) => {
      // An unmuted element (see `useVideoElementAudio`) can be refused by
      // the autoplay policy before the page has a user gesture. Sound is
      // the negotiable half of that: mute and retry so the PICTURE still
      // plays, and mute at the master level because the constraint is
      // browser-wide rather than this source's. A rejection with the
      // element already muted is not the policy — leave it to the caller,
      // which may show a click-to-play UI.
      if (cancelled) return;
      if ((error as DOMException | null)?.name !== "NotAllowedError") return;
      if (v.muted) return;
      concedeMasterMuteToAutoplayPolicy(store);
      v.muted = true;
      void v.play().catch(() => {
        // Still refused with no sound to give up — nothing left to try.
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isPlaying, isBuffering, videoRef, store]);

  // Speed. With a `PlaybackClockSource` registered (video-anchored playback)
  // the engine does no `dt` arithmetic at all — the element paces the
  // timeline — so `playbackRate` is the only thing the speed control can
  // act on. In wallclock mode it keeps the picture matching a playhead the
  // engine is advancing at `speed x dt`.
  useEffect(() => {
    const apply = () => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = store.get(speedAtom);
    };
    apply();

    // The element is reused across sources, and the media load algorithm
    // resets `playbackRate` to `defaultPlaybackRate` (1) on every load. The
    // store keeps the viewer's chosen speed across that swap, so re-apply
    // it once the new source has taken the reset — otherwise navigating
    // samples silently drops the timeline back to 1x while the speed
    // control still reads 2x.
    const v = videoRef.current;
    v?.addEventListener("loadstart", apply);
    v?.addEventListener("loadedmetadata", apply);

    const unsub = store.sub(speedAtom, apply);
    return () => {
      unsub();
      v?.removeEventListener("loadstart", apply);
      v?.removeEventListener("loadedmetadata", apply);
    };
  }, [store, videoRef]);

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
