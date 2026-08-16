// ---------------------------------------------------------------------------
// Multi-track audio state for the continuous-time playback engine.
//
// Every audio source (the native <audio>-element track today, Foxglove
// RawAudio/CompressedAudio-backed PCM tracks in the future) is "just another
// audio source": it registers a PlaybackStream (see types.ts) for engine
// barrier/transport purposes, and separately registers an
// `AudioTrackDescriptor` here so it shows up in the Mixed dropdown and any
// per-track UI. The two registrations share one id space — a track's id
// MUST equal its PlaybackStream id.
//
// Layering matches atoms.ts: these atoms are an implementation detail of
// this package. React components read them through the wrapper hooks in
// use-playback-state.ts; stream plumbing and tests use the imperative
// helpers in store-access.ts.
// ---------------------------------------------------------------------------

import { atom } from "jotai/vanilla";
import {
  atomFamily,
  atomWithStorage,
  createJSONStorage,
} from "jotai/vanilla/utils";

/**
 * Where a registered audio track's samples originate. Extend this union as
 * new source kinds are added (closed union — every new format needs an
 * explicit member so switch-based consumers stay exhaustive).
 */
export type AudioSourceKind =
  /** A hidden <audio> element muxed with a video (video-annotation). */
  | "native-element"
  /** Decoded PCM driven through Web Audio, whatever container it came from. */
  | "pcm"
  | "foxglove-raw"
  | "foxglove-compressed";

/**
 * Roster metadata for one registered audio track. This is NOT the stream
 * itself (streams are tracked internally by the engine's own registry,
 * which is unexported) — it's a small parallel roster the Mixed dropdown
 * and per-tile mute button read.
 *
 * `id` MUST equal the `PlaybackStream.id` the same source registers via
 * `registerStream`, so the Mixed dropdown, the tile mute button, and the
 * engine's stream registry all agree on identity without a second mapping
 * table.
 */
export interface AudioTrackDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: AudioSourceKind;
}

const guardedStorage = (
  kind: "localStorage" | "sessionStorage",
): Storage | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window[kind];
  } catch {
    return undefined;
  }
};

/** Per-track fader default: unity gain. The master fader is the lever a
 * user reaches for first; a freshly-registered track shouldn't silently
 * attenuate on top of that. */
export const DEFAULT_TRACK_VOLUME = 1.0;

/**
 * Per-track volume in [0, 1], keyed by track id. Persisted per user across
 * sessions, mirroring `audioVolumeAtom`'s storage choice.
 */
export const audioTrackVolumeAtom = atomFamily((trackId: string) =>
  atomWithStorage(
    `fo-playback-audio-track-volume:${trackId}`,
    DEFAULT_TRACK_VOLUME,
    createJSONStorage<number>(() => guardedStorage("localStorage")),
    { getOnInit: true },
  ),
);

/**
 * Per-track mute, keyed by track id. Session-scoped like `audioMutedAtom`
 * (a fresh per-track mute isn't subject to the autoplay-policy default that
 * `audioMasterMutedAtom` starts muted for — only the master gate needs
 * that; per-track defaults to audible).
 */
export const audioTrackMutedAtom = atomFamily((trackId: string) =>
  atomWithStorage(
    `fo-playback-audio-track-muted:${trackId}`,
    false,
    createJSONStorage<boolean>(() => guardedStorage("sessionStorage")),
    { getOnInit: true },
  ),
);

/**
 * Roster of currently-registered audio tracks. Sources register themselves
 * on mount and unregister on cleanup via `registerAudioTrack`/
 * `unregisterAudioTrack` in store-access.ts — never written directly.
 */
export const audioTracksAtom = atom<readonly AudioTrackDescriptor[]>([]);

/** One track's roster metadata plus its own (not master-combined) volume/mute. */
export interface AudioTrackSnapshot extends AudioTrackDescriptor {
  readonly volume: number;
  readonly muted: boolean;
}

/**
 * Derived read: the roster with each track's own volume/mute inlined.
 * Jotai tracks `audioTrackVolumeAtom(id)`/`audioTrackMutedAtom(id)` as
 * dependencies dynamically, so this recomputes (and any subscriber
 * re-renders) whenever the roster OR any individual track's fader changes —
 * unlike a plain imperative `store.get` snapshot, which would go stale.
 */
export const audioTrackSnapshotsAtom = atom((get) =>
  get(audioTracksAtom).map(
    (descriptor): AudioTrackSnapshot => ({
      ...descriptor,
      volume: get(audioTrackVolumeAtom(descriptor.id)),
      muted: get(audioTrackMutedAtom(descriptor.id)),
    }),
  ),
);

// Master volume/mute live in atoms.ts as `audioMasterVolumeAtom`/
// `audioMasterMutedAtom` — renaming re-exports of the pre-existing
// `audioVolumeAtom`/`audioMutedAtom` (same atom identity, defined there to
// avoid a circular import between this file and atoms.ts).
