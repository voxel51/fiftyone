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
  type AudioAvailability,
  type AudioTrackDescriptor,
  audioAvailableAtom,
  audioMasterMutedAtom,
  audioMasterVolumeAtom,
  audioMutedAtom,
  audioTrackMutedAtom,
  audioTracksAtom,
  audioTrackVolumeAtom,
  audioVolumeAtom,
  bufferedRangesAtom,
  bufferingDetailAtom,
  bufferingStreamsAtom,
  currentTimeAtom,
  hoverTimeAtom,
  inspectionMarkerAtom,
  isBufferingAtom,
  isPlayPendingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  seekFetchDebounceMsAtom,
  streamRangesVersionAtom,
  streamValueAtom,
} from "./atoms";
import { effectiveMuted, effectiveVolume, volumeMagnitude } from "./audio-math";
import type { BufferedRanges, BufferingStream, PlaybackStore } from "./types";

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

/** Current trailing delay for missing-data fetches after a seek. */
export function getSeekFetchDebounceMs(store: PlaybackStore): number {
  return store.get(seekFetchDebounceMsAtom);
}

/**
 * Updates the missing-data seek debounce for a long-lived playback store.
 * Invalid and negative values restore immediate fetch admission.
 */
export function setSeekFetchDebounceMs(
  store: PlaybackStore,
  debounceMs: number,
): void {
  store.set(
    seekFetchDebounceMsAtom,
    Number.isFinite(debounceMs) && debounceMs > 0 ? debounceMs : 0,
  );
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

/** Publishes or moves one owner's persistent visual inspection marker. */
export function publishInspectionMarker(
  store: PlaybackStore,
  ownerId: string,
  timeSec: number,
): void {
  if (!ownerId || !Number.isFinite(timeSec)) return;
  store.set(inspectionMarkerAtom, { ownerId, timeSec });
}

/** Clears the marker only when it is still owned by the caller. */
export function clearInspectionMarker(
  store: PlaybackStore,
  ownerId: string,
): void {
  store.set(inspectionMarkerAtom, (current) =>
    current?.ownerId === ownerId ? null : current,
  );
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

/** Non-reactive read of the streams behind the buffering indicator. */
export function getBufferingStreams(
  store: PlaybackStore,
): readonly BufferingStream[] {
  return store.get(bufferingStreamsAtom);
}

/**
 * Publish blocking stream readiness for buffering UI. Equal snapshots are
 * ignored because data streams may report status on every fetched tick.
 */
export function setBufferingStreams(
  store: PlaybackStore,
  streams: readonly BufferingStream[],
): void {
  const current = store.get(bufferingStreamsAtom);
  if (
    current.length === streams.length &&
    current.every(
      (stream, index) =>
        stream.id === streams[index]?.id &&
        stream.label === streams[index]?.label &&
        stream.state === streams[index]?.state,
    )
  ) {
    return;
  }
  store.set(bufferingStreamsAtom, [...streams]);
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

/** Non-reactive read of the timeline's audio status. */
export function getAudioAvailable(store: PlaybackStore): AudioAvailability {
  return store.get(audioAvailableAtom);
}

/** Publish the timeline's audio status; see `audioAvailableAtom`. */
export function setAudioAvailable(
  store: PlaybackStore,
  availability: AudioAvailability,
): void {
  store.set(audioAvailableAtom, availability);
}

// ---------------------------------------------------------------------------
// Per-track audio state (multi-track model). `audioVolumeAtom`/
// `audioMutedAtom` above remain the storage-backed atoms; the accessors
// below read/write them under their "master" names (`audioMasterVolumeAtom`
// / `audioMasterMutedAtom` are the same atom identities — see atoms.ts).
// ---------------------------------------------------------------------------

/** Non-reactive read of the master audio volume in [0, 1]. */
export function getMasterVolume(store: PlaybackStore): number {
  return store.get(audioMasterVolumeAtom);
}

/** Set the master audio volume. Clamped to [0, 1]; non-finite values are ignored. */
export function setMasterVolume(store: PlaybackStore, volume: number): void {
  if (!Number.isFinite(volume)) return;
  store.set(audioMasterVolumeAtom, Math.min(1, Math.max(0, volume)));
}

/** Non-reactive read of the master audio muted flag. */
export function getMasterMuted(store: PlaybackStore): boolean {
  return store.get(audioMasterMutedAtom);
}

/** Mute / unmute every audio track at once. */
export function setMasterMuted(store: PlaybackStore, muted: boolean): void {
  store.set(audioMasterMutedAtom, muted);
}

/**
 * Whether the master mute flag is still its untouched session default
 * (muted, to satisfy browser autoplay policy) rather than a value the
 * viewer chose.
 *
 * `audioMasterMutedAtom` is an `atomWithStorage` over `sessionStorage`, so
 * "no stored key" means the viewer has not muted or unmuted this session.
 * A source can use this to unmute on the first explicit play — a real user
 * gesture, which is exactly what the autoplay default is waiting for —
 * without ever overriding a deliberate mute.
 */
export function isMasterMuteAtSessionDefault(): boolean {
  // No window (SSR) means no stored preference either — the same answer as
  // an empty store, not `false`, which would wrongly imply a deliberate mute.
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(MASTER_MUTED_STORAGE_KEY) === null;
  } catch {
    // Storage can throw in sandboxed/blocked contexts; treat an
    // unreadable store as "the viewer has expressed no preference".
    return true;
  }
}

const MASTER_MUTED_STORAGE_KEY = "fo-playback-audio-muted";

/**
 * Mute everything because the browser's autoplay policy refused an unmuted
 * element — a constraint of the environment, not a choice the viewer made.
 *
 * Distinct from {@link setMasterMuted} in exactly one way: it leaves the
 * session-default flag intact, so {@link isMasterMuteAtSessionDefault} still
 * reports "the viewer has expressed no preference" and a later real play
 * gesture can unmute. Recording the concession as a deliberate mute would
 * silence every subsequent sample and surface for the rest of the session
 * on the strength of one refusal.
 */
export function concedeMasterMuteToAutoplayPolicy(store: PlaybackStore): void {
  setMasterMuted(store, true);
  if (typeof window === "undefined") return;
  try {
    // `audioMasterMutedAtom` is an `atomWithStorage`, so the write above
    // persisted the key. Drop it again: the stored value and the untouched
    // default are both "muted", so a reload lands in the same state either
    // way, and the flag goes back to meaning what it says.
    window.sessionStorage.removeItem(MASTER_MUTED_STORAGE_KEY);
  } catch {
    // Unreadable/unwritable storage already reads as "no preference".
  }
}

/** Non-reactive read of one track's volume fader, in [0, 1]. */
export function getTrackVolume(store: PlaybackStore, trackId: string): number {
  return store.get(audioTrackVolumeAtom(trackId));
}

/** Set one track's volume fader. Clamped to [0, 1]; non-finite values are ignored. */
export function setTrackVolume(
  store: PlaybackStore,
  trackId: string,
  volume: number,
): void {
  if (!Number.isFinite(volume)) return;
  store.set(audioTrackVolumeAtom(trackId), Math.min(1, Math.max(0, volume)));
}

/** Non-reactive read of one track's mute flag. */
export function getTrackMuted(store: PlaybackStore, trackId: string): boolean {
  return store.get(audioTrackMutedAtom(trackId));
}

/** Mute / unmute a single track without affecting any other track or the master fader. */
export function setTrackMuted(
  store: PlaybackStore,
  trackId: string,
  muted: boolean,
): void {
  store.set(audioTrackMutedAtom(trackId), muted);
}

/**
 * The volume a track's own hook should actually apply to its medium right
 * now: `trackVolume * masterVolume`, or `0` if either is muted.
 */
export function getEffectiveTrackVolume(
  store: PlaybackStore,
  trackId: string,
): number {
  return effectiveVolume({
    trackVolume: getTrackVolume(store, trackId),
    trackMuted: getTrackMuted(store, trackId),
    masterVolume: getMasterVolume(store),
    masterMuted: getMasterMuted(store),
  });
}

/** Whether a track is inaudible right now because it or the master is muted. */
export function getEffectiveTrackMuted(
  store: PlaybackStore,
  trackId: string,
): boolean {
  return effectiveMuted({
    trackMuted: getTrackMuted(store, trackId),
    masterMuted: getMasterMuted(store),
  });
}

/**
 * The volume level a track should report/restore-to, independent of mute
 * (`trackVolume * masterVolume`, never zeroed). For a source with its own
 * separate mute mechanism (e.g. `HTMLMediaElement.muted`), apply this to
 * `.volume` and `getEffectiveTrackMuted` to `.muted` — so unmuting is
 * instant rather than waiting on a volume update. A source with no
 * separate mute concept (e.g. a Web Audio `GainNode`) should use
 * `getEffectiveTrackVolume` instead.
 */
export function getTrackVolumeMagnitude(
  store: PlaybackStore,
  trackId: string,
): number {
  return volumeMagnitude({
    trackVolume: getTrackVolume(store, trackId),
    masterVolume: getMasterVolume(store),
  });
}

/** Non-reactive read of the registered-audio-track roster. */
export function getAudioTracks(
  store: PlaybackStore,
): readonly AudioTrackDescriptor[] {
  return store.get(audioTracksAtom);
}

/**
 * Adds a track to the roster (replacing any existing entry with the same
 * id) so it shows up in the Mixed dropdown / per-tile mute button. Returns
 * an unregister function — callers should invoke it on cleanup (e.g. a
 * `useEffect` teardown) so the roster reflects only currently-mounted
 * sources.
 */
export function registerAudioTrack(
  store: PlaybackStore,
  descriptor: AudioTrackDescriptor,
): () => void {
  store.set(audioTracksAtom, (current) => {
    // Replace in place. Removing and re-appending would move a track to the
    // end of the mixer every time it re-registered — which happens on any
    // descriptor change — so the rows reshuffled under the user's cursor.
    const existing = current.findIndex((track) => track.id === descriptor.id);
    if (existing === -1) return [...current, descriptor];
    const next = [...current];
    next[existing] = descriptor;
    return next;
  });
  return () => unregisterAudioTrack(store, descriptor.id);
}

/** Removes a track from the roster by id. No-op if it's already absent. */
export function unregisterAudioTrack(
  store: PlaybackStore,
  trackId: string,
): void {
  store.set(audioTracksAtom, (current) =>
    current.filter((track) => track.id !== trackId),
  );
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
