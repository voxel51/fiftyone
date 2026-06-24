// ---------------------------------------------------------------------------
// Imperative access to playback state for code that already holds a
// PlaybackStore: PlaybackStream implementations (e.g. the MCAP data
// stream), component event handlers, and tests. React components subscribe
// through the hooks in `use-playback-state.ts` / `use-stream.ts` instead.
//
// This surface is deliberately narrower than the atom set — it encodes who
// may write what. There is no setPlayhead / setIsPlaying here: the engine
// owns the clock, and user intent goes through the `usePlayback()` actions
// (seek, play, pause, …). Streams only *publish* — their values and their
// buffering feedback — and clear the paused-catch-up buffering flag.
// ---------------------------------------------------------------------------

import {
  bufferedRangesAtom,
  bufferingDetailAtom,
  isBufferingAtom,
  isPlayingAtom,
  playheadAtom,
  streamValueAtom,
} from "./atoms";
import type { BufferedRanges, PlaybackStore } from "./types";

/** Non-reactive read of the visual playhead position, in seconds. */
export function getPlayhead(store: PlaybackStore): number {
  return store.get(playheadAtom);
}

/**
 * Watch playhead changes — fires on every committed RAF tick and on
 * scrubs. Returns the unsubscribe function.
 */
export function subscribePlayhead(
  store: PlaybackStore,
  callback: () => void
): () => void {
  return store.sub(playheadAtom, callback);
}

/**
 * Non-reactive read of the playing flag. Use in command/event handlers
 * that need the latest value without subscribing the component body to an
 * extra atom.
 */
export function getIsPlaying(store: PlaybackStore): boolean {
  return store.get(isPlayingAtom);
}

/** Non-reactive read of the engine buffering flag. */
export function getIsBuffering(store: PlaybackStore): boolean {
  return store.get(isBufferingAtom);
}

/**
 * Write the engine buffering flag. The engine raises it (RAF stalls,
 * paused seeks into uncached data); while paused it has no tick to clear
 * it, so the stream that fulfils the pending data flips it back to `false`
 * once the playhead time is covered. Streams should never set it to `true`.
 */
export function setIsBuffering(
  store: PlaybackStore,
  isBuffering: boolean
): void {
  store.set(isBufferingAtom, isBuffering);
}

/** Non-reactive read of the buffering progress detail. */
export function getBufferingDetail(store: PlaybackStore): string | null {
  return store.get(bufferingDetailAtom);
}

/**
 * Publish a human-readable buffering progress detail (e.g. "3/7 streams"),
 * or `null` to hide it.
 */
export function setBufferingDetail(
  store: PlaybackStore,
  detail: string | null
): void {
  store.set(bufferingDetailAtom, detail);
}

/** Non-reactive read of the published buffered time ranges. */
export function getBufferedRanges(store: PlaybackStore): BufferedRanges {
  return store.get(bufferedRangesAtom);
}

/** Publish the time ranges that are buffered across every blocking stream. */
export function setBufferedRanges(
  store: PlaybackStore,
  ranges: BufferedRanges
): void {
  store.set(bufferedRangesAtom, ranges);
}

/** Non-reactive read of a stream's current committed value. */
export function getStreamValue<T = unknown>(
  store: PlaybackStore,
  id: string
): T | null {
  return store.get(streamValueAtom(id)) as T | null;
}

/**
 * Publish a stream's current value — the data layer's commit path that
 * `useStream(id)` / `useStreamValue(id)` consumers re-render from.
 */
export function setStreamValue(
  store: PlaybackStore,
  id: string,
  value: unknown
): void {
  store.set(streamValueAtom(id), value);
}
