// ---------------------------------------------------------------------------
// Public multi-track audio API. `useAudio()` is a thin composition of the
// reactive read hooks in `use-audio-state.ts` and the imperative setters in
// `store-access.ts` — it introduces no new context/provider (it reads the
// same store `usePlayback()` already resolves via `usePlaybackStore()`), so
// it works anywhere inside an existing `<PlaybackProvider>`.
//
// Every audio source — the native <audio>-element track today, Foxglove
// RawAudio/CompressedAudio-backed PCM tracks in the future — is "just
// another audio source": it registers a PlaybackStream (unchanged
// interface, via `usePlayback().registerStream`) for engine barrier
// purposes, and separately calls `registerAudioTrack(...)` from this hook
// (or the imperative `registerAudioTrack` in store-access.ts, for
// non-component code) so it appears in the Mixed dropdown / tile mute
// button roster. `useAudio()` itself never touches an HTMLAudioElement or
// AudioContext — only the numbers each source's own hook then applies.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from "react";
import type {
  AudioAvailability,
  AudioSourceKind,
  AudioTrackDescriptor,
} from "./atoms";
import { effectiveVolume } from "./audio-math";
import { usePlaybackStore } from "./playback-store-context";
import {
  registerAudioTrack as registerAudioTrackImpl,
  setMasterMuted as setMasterMutedImpl,
  setMasterVolume as setMasterVolumeImpl,
  setTrackMuted as setTrackMutedImpl,
  setTrackVolume as setTrackVolumeImpl,
} from "./store-access";
import {
  useAudioTrackSnapshots,
  useMasterMuted,
  useMasterVolume,
} from "./use-audio-state";
import { useAudioAvailable } from "./use-playback-state";

export type { AudioSourceKind, AudioTrackDescriptor };

export interface AudioTrackHandle {
  readonly id: string;
  readonly label: string;
  readonly kind: AudioSourceKind;
  /** This track's own fader, in [0, 1] — independent of the master fader. */
  readonly volume: number;
  /** This track's own mute flag — independent of the master mute. */
  readonly muted: boolean;
  /** What should actually be audible right now: `volume * masterVolume`, 0 if either is muted. */
  readonly effectiveVolume: number;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
}

export interface AudioContextValue {
  readonly tracks: readonly AudioTrackHandle[];
  readonly masterVolume: number;
  readonly masterMuted: boolean;
  readonly availability: AudioAvailability;
  setMasterVolume(volume: number): void;
  setMasterMuted(muted: boolean): void;
  /**
   * Imperative registration point for a new audio source. Returns an
   * unregister function — call it from the registering effect's cleanup.
   */
  registerAudioTrack(descriptor: AudioTrackDescriptor): () => void;
}

/**
 * NOTE: this hook subscribes to the full track roster and every registered
 * track's volume/mute atoms, so it re-renders whenever any track's state
 * changes. Fine for the Mixed dropdown / tile mute button (low-cardinality,
 * UI-only); a source's own playback-critical hook (e.g. `useAudioStream`)
 * should keep reading its own track's state directly via `store-access.ts`
 * rather than depending on this hook's re-render cadence.
 */
export function useAudio(): AudioContextValue {
  const store = usePlaybackStore();
  // Reactive: recomputes on roster changes AND on any individual track's
  // own volume/mute changing (derived jotai atom — see audio-atoms.ts),
  // so dragging one track's fader re-renders every `useAudio()` consumer
  // that displays it (e.g. the Mixed dropdown).
  const snapshots = useAudioTrackSnapshots();
  const masterVolume = useMasterVolume();
  const masterMuted = useMasterMuted();
  const availability = useAudioAvailable();

  const tracks = useMemo<AudioTrackHandle[]>(
    () =>
      snapshots.map((snapshot) => ({
        ...snapshot,
        effectiveVolume: effectiveVolume({
          trackVolume: snapshot.volume,
          trackMuted: snapshot.muted,
          masterVolume,
          masterMuted,
        }),
        setVolume: (next: number) =>
          setTrackVolumeImpl(store, snapshot.id, next),
        setMuted: (next: boolean) =>
          setTrackMutedImpl(store, snapshot.id, next),
      })),
    [store, snapshots, masterVolume, masterMuted],
  );

  const setMasterVolume = useCallback(
    (volume: number) => setMasterVolumeImpl(store, volume),
    [store],
  );
  const setMasterMuted = useCallback(
    (muted: boolean) => setMasterMutedImpl(store, muted),
    [store],
  );
  const registerAudioTrack = useCallback(
    (descriptor: AudioTrackDescriptor) =>
      registerAudioTrackImpl(store, descriptor),
    [store],
  );

  return {
    tracks,
    masterVolume,
    masterMuted,
    availability,
    setMasterVolume,
    setMasterMuted,
    registerAudioTrack,
  };
}
