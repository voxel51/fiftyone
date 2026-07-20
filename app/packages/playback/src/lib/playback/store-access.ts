// ---------------------------------------------------------------------------
// Imperative access to playback state for code that already holds a
// PlaybackStore: PlaybackStream implementations (e.g. the MCAP data
// stream), component event handlers, tests, and specialized hooks that sample
// a high-frequency value. React components normally subscribe through the
// hooks in `use-playback-state.ts` / `use-stream.ts` instead.
//
// This surface is deliberately narrower than the atom set — it encodes who
// may write what. There is no setPlayhead / setIsPlaying here: the engine
// owns the clock, and user intent goes through the `usePlayback()` actions
// (seek, play, pause, …). Streams only *publish* — their values and their
// buffering feedback — and clear the paused-catch-up buffering flag.
// ---------------------------------------------------------------------------

import {
  audioAvailableAtom,
  audioMutedAtom,
  audioVolumeAtom,
  bufferedRangesAtom,
  bufferingDetailAtom,
  currentTimeAtom,
  hoverTimeAtom,
  isBufferingAtom,
  isPlayPendingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  streamRangesVersionAtom,
  streamValueAtom,
} from "./atoms";
import type { BufferedRanges, PlaybackStore } from "./types";

/** Non-reactive read of the visual playhead position, in seconds. */
export function getPlayhead(store: PlaybackStore): number {
  return store.get(playheadAtom);
}

/** Non-reactive read of the latest time committed by the playback engine. */
export function getCurrentTime(store: PlaybackStore): number {
  return store.get(currentTimeAtom);
}

/** Watch playback commits; returns the unsubscribe function. */
export function subscribeCurrentTime(
  store: PlaybackStore,
  callback: () => void,
): () => void {
  return store.sub(currentTimeAtom, callback);
}

/** Non-reactive read of the active loop start, in seconds. */
export function getLoopStart(store: PlaybackStore): number {
  return store.get(loopStartAtom);
}

/** Non-reactive read of the active loop end, in seconds. */
export function getLoopEnd(store: PlaybackStore): number {
  return store.get(loopEndAtom);
}

/**
 * Watch playhead changes — fires on every committed RAF tick and on
 * scrubs. Returns the unsubscribe function.
 */
export function subscribePlayhead(
  store: PlaybackStore,
  callback: () => void,
): () => void {
  return store.sub(playheadAtom, callback);
}

/** Non-reactive read of the hovered timeline time, in seconds (or null). */
export function getHoverTime(store: PlaybackStore): number | null {
  return store.get(hoverTimeAtom);
}

/**
 * Publishes the timeline time the pointer is inspecting (null to clear).
 * Unlike the playhead, hover is UI-owned, so surfaces write it directly.
 */
export function setHoverTime(store: PlaybackStore, timeSec: number | null) {
  store.set(hoverTimeAtom, timeSec);
}

/** Subscribes to hovered-time changes; returns an unsubscribe. */
export function subscribeHoverTime(
  store: PlaybackStore,
  callback: () => void,
): () => void {
  return store.sub(hoverTimeAtom, callback);
}

/**
 * Non-reactive read of the playing flag. Use in command/event handlers
 * that need the latest value without subscribing the component body to an
 * extra atom.
 */
export function getIsPlaying(store: PlaybackStore): boolean {
  return store.get(isPlayingAtom);
}

/**
 * Non-reactive read of queued play intent. Use with getIsPlaying() in
 * event handlers that need Play/Pause toggle semantics before active
 * playback has actually started.
 */
export function getIsPlayPending(store: PlaybackStore): boolean {
  return store.get(isPlayPendingAtom);
}

/**
 * Watch queued-play-intent flips — a press waiting on startup coverage
 * and the moment it starts or is abandoned. Returns the unsubscribe.
 */
export function subscribeIsPlayPending(
  store: PlaybackStore,
  callback: () => void,
): () => void {
  return store.sub(isPlayPendingAtom, callback);
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
  isBuffering: boolean,
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
  detail: string | null,
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
  ranges: BufferedRanges,
): void {
  store.set(bufferedRangesAtom, ranges);
}

/**
 * Wake pending playback after a stream's private `bufferedRanges()` changes
 * without replacing the timeline-visible data ranges.
 */
export function bumpStreamRangesVersion(store: PlaybackStore): void {
  store.set(streamRangesVersionAtom, store.get(streamRangesVersionAtom) + 1);
}

/** Non-reactive read of the audio volume in [0, 1]. */
export function getAudioVolume(store: PlaybackStore): number {
  return store.get(audioVolumeAtom);
}

/** Set the audio volume. Clamped to [0, 1]; non-finite values are ignored. */
export function setAudioVolume(store: PlaybackStore, volume: number): void {
  if (!Number.isFinite(volume)) return;
  store.set(audioVolumeAtom, Math.min(1, Math.max(0, volume)));
}

/** Non-reactive read of the audio muted flag. */
export function getAudioMuted(store: PlaybackStore): boolean {
  return store.get(audioMutedAtom);
}

/**
 * Mute / unmute timeline audio. Muting sends any registered audio stream
 * dormant, so a muted timeline never waits on audio buffering.
 */
export function setAudioMuted(store: PlaybackStore, muted: boolean): void {
  store.set(audioMutedAtom, muted);
}

/** Non-reactive read of whether the timeline has audio to control. */
export function getAudioAvailable(store: PlaybackStore): boolean {
  return store.get(audioAvailableAtom);
}

/**
 * Publish whether the timeline has audible audio. Audio integrations set
 * this; the volume UI hides entirely while it's false.
 */
export function setAudioAvailable(
  store: PlaybackStore,
  available: boolean,
): void {
  store.set(audioAvailableAtom, available);
}

/** Non-reactive read of a stream's current committed value. */
export function getStreamValue<T = unknown>(
  store: PlaybackStore,
  id: string,
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
  value: unknown,
): void {
  store.set(streamValueAtom(id), value);
}
