// ---------------------------------------------------------------------------
// Reactive read-only hooks for the playback atoms. Components MUST go
// through these instead of calling `useAtomValue(...)` directly — keeps
// jotai out of the view layer and gives us one place to evolve the
// reactive read story (memoization, derived state, dev warnings, …).
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
  viewEndAtom,
  viewStartAtom,
} from "./atoms";

/** Visual playhead position in seconds — updates every RAF tick + on scrub. */
export function usePlayhead(): number {
  return useAtomValue(playheadAtom);
}

/**
 * Last time the engine confirmed all blocking streams were ready. Lags
 * `usePlayhead()` while buffering — use this to drive data, not visuals.
 */
export function useCurrentTime(): number {
  return useAtomValue(currentTimeAtom);
}

export function useIsPlaying(): boolean {
  return useAtomValue(isPlayingAtom);
}

export function useIsBuffering(): boolean {
  return useAtomValue(isBufferingAtom);
}

/** Live duration (max of registered streams, or the provider's fallback). */
export function useDuration(): number {
  return useAtomValue(durationAtom);
}

/** Left edge of the visible timeline window, in seconds. */
export function useViewStart(): number {
  return useAtomValue(viewStartAtom);
}

/** Right edge of the visible timeline window, in seconds. */
export function useViewEnd(): number {
  return useAtomValue(viewEndAtom);
}

export function useLoopStart(): number {
  return useAtomValue(loopStartAtom);
}

export function useLoopEnd(): number {
  return useAtomValue(loopEndAtom);
}

/** Playback speed multiplier. 1.0 = normal. */
export function useSpeed(): number {
  return useAtomValue(speedAtom);
}

/**
 * Most recent discontinuous-jump event (seek / step / loop-wrap). `null`
 * before any jump has fired. The `seq` counter changes even when `time`
 * repeats, so consumers can re-fire on every event.
 */
export function useSeekEvent(): { time: number; seq: number } | null {
  return useAtomValue(seekEventAtom);
}
