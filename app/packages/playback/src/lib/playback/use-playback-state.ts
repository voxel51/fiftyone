// ---------------------------------------------------------------------------
// Reactive read-only hooks for the playback atoms. Components MUST go
// through these instead of calling `useAtomValue(...)` directly — keeps
// jotai out of the view layer and gives us one place to evolve the
// reactive read story (memoization, derived state, dev warnings, …).
//
// Every hook reads through `usePlaybackStore()` and targets that store
// explicitly via `useAtomValue(atom, { store })`. That way the playback
// atoms always resolve to the surrounding `<PlaybackProvider>`'s store
// regardless of any other Jotai `<Provider>` (e.g. TilingProvider's)
// nested between the provider and the consumer.
// ---------------------------------------------------------------------------

import { useAtomValue } from "jotai";
import {
  currentTimeAtom,
  durationAtom,
  isBufferingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  seekEventAtom,
  speedAtom,
  stepIntervalAtom,
  viewEndAtom,
  viewStartAtom,
} from "./atoms";
import { usePlaybackStore } from "./playback-store-context";

/** Visual playhead position in seconds — updates every RAF tick + on scrub. */
export function usePlayhead(): number {
  const store = usePlaybackStore();
  return useAtomValue(playheadAtom, { store });
}

/**
 * Last time the engine confirmed all blocking streams were ready. Lags
 * `usePlayhead()` while buffering — use this to drive data, not visuals.
 */
export function useCurrentTime(): number {
  const store = usePlaybackStore();
  return useAtomValue(currentTimeAtom, { store });
}

export function useIsPlaying(): boolean {
  const store = usePlaybackStore();
  return useAtomValue(isPlayingAtom, { store });
}

export function useIsBuffering(): boolean {
  const store = usePlaybackStore();
  return useAtomValue(isBufferingAtom, { store });
}

/** Live duration (max of registered streams, or the provider's fallback). */
export function useDuration(): number {
  const store = usePlaybackStore();
  return useAtomValue(durationAtom, { store });
}

/** Live step interval (min of registered streams, or the provider's fallback). */
export function useStepInterval(): number {
  const store = usePlaybackStore();
  return useAtomValue(stepIntervalAtom, { store });
}

/** Left edge of the visible timeline window, in seconds. */
export function useViewStart(): number {
  const store = usePlaybackStore();
  return useAtomValue(viewStartAtom, { store });
}

/** Right edge of the visible timeline window, in seconds. */
export function useViewEnd(): number {
  const store = usePlaybackStore();
  return useAtomValue(viewEndAtom, { store });
}

export function useLoopStart(): number {
  const store = usePlaybackStore();
  return useAtomValue(loopStartAtom, { store });
}

export function useLoopEnd(): number {
  const store = usePlaybackStore();
  return useAtomValue(loopEndAtom, { store });
}

/** Playback speed multiplier. 1.0 = normal. */
export function useSpeed(): number {
  const store = usePlaybackStore();
  return useAtomValue(speedAtom, { store });
}

/**
 * Most recent discontinuous-jump event (seek / step / loop-wrap). `null`
 * before any jump has fired. The `seq` counter changes even when `time`
 * repeats, so consumers can re-fire on every event.
 */
export function useSeekEvent(): { time: number; seq: number } | null {
  const store = usePlaybackStore();
  return useAtomValue(seekEventAtom, { store });
}
