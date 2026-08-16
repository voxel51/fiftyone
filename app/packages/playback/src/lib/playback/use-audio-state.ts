// ---------------------------------------------------------------------------
// Reactive read hooks for the multi-track audio model. Same discipline as
// use-playback-state.ts: every hook binds `usePlaybackStore()` explicitly
// via `useAtomValue(atom, { store })`, never a bare `useAtomValue(atom)`.
// ---------------------------------------------------------------------------

import { useAtomValue } from "jotai";
import {
  type AudioTrackDescriptor,
  type AudioTrackSnapshot,
  audioMasterMutedAtom,
  audioMasterVolumeAtom,
  audioTrackMutedAtom,
  audioTracksAtom,
  audioTrackSnapshotsAtom,
  audioTrackVolumeAtom,
} from "./atoms";
import { effectiveVolume } from "./audio-math";
import { usePlaybackStore } from "./playback-store-context";

/** The full roster of currently-registered audio tracks. */
export function useAudioTracks(): readonly AudioTrackDescriptor[] {
  const store = usePlaybackStore();
  return useAtomValue(audioTracksAtom, { store });
}

/**
 * The roster with each track's own volume/mute inlined, reactively —
 * re-renders on roster changes AND on any individual track's fader
 * changing (unlike an imperative snapshot via `store-access.ts`'s getters).
 */
export function useAudioTrackSnapshots(): readonly AudioTrackSnapshot[] {
  const store = usePlaybackStore();
  return useAtomValue(audioTrackSnapshotsAtom, { store });
}

/** One track's volume fader, in [0, 1]. Write via `setTrackVolume` in store-access. */
export function useTrackVolume(trackId: string): number {
  const store = usePlaybackStore();
  return useAtomValue(audioTrackVolumeAtom(trackId), { store });
}

/** One track's mute flag. Write via `setTrackMuted` in store-access. */
export function useTrackMuted(trackId: string): boolean {
  const store = usePlaybackStore();
  return useAtomValue(audioTrackMutedAtom(trackId), { store });
}

/**
 * The volume this track should actually be played at right now:
 * `trackVolume * masterVolume`, or `0` if either is muted.
 */
export function useEffectiveTrackVolume(trackId: string): number {
  const trackVolume = useTrackVolume(trackId);
  const trackMuted = useTrackMuted(trackId);
  const masterVolume = useMasterVolume();
  const masterMuted = useMasterMuted();
  return effectiveVolume({
    trackVolume,
    trackMuted,
    masterVolume,
    masterMuted,
  });
}

/**
 * Master volume in [0, 1] — the single fader that scales every track's
 * effective volume. Write via `setMasterVolume` in store-access. Named
 * distinctly from the legacy `useAudioVolume()` so call sites read as
 * "master" deliberately going forward.
 */
export function useMasterVolume(): number {
  const store = usePlaybackStore();
  return useAtomValue(audioMasterVolumeAtom, { store });
}

/** Master mute — mutes every track regardless of its own mute state. */
export function useMasterMuted(): boolean {
  const store = usePlaybackStore();
  return useAtomValue(audioMasterMutedAtom, { store });
}
