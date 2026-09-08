import { useMemo } from "react";
import { DEFAULT_AUDIO_VOLUME } from "../../lib/playback/atoms";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import { getMasterVolume } from "../../lib/playback/store-access";
import { useAudio } from "../../lib/playback/use-audio";

/**
 * The master fader's state plus its three handlers, shared by the standalone
 * `VolumeControl` and the mixer's Master row.
 *
 * Both surfaces drive the same atoms and must apply the same rules —
 * notably "never unmute into silence", which restores
 * `DEFAULT_AUDIO_VOLUME` when unmuting a fader parked at zero. Duplicating
 * that in each component let the two disagree if only one was updated.
 */
export function useMasterChannel() {
  const { masterMuted, masterVolume, setMasterMuted, setMasterVolume } =
    useAudio();
  const store = usePlaybackStore();

  return useMemo(
    () => ({
      muted: masterMuted,
      value: masterVolume,
      onVolumeChange: (next: number) => {
        setMasterVolume(next);
        setMasterMuted(false);
      },
      onMute: () => setMasterMuted(true),
      onUnmute: () => {
        // Never unmute into silence. Read the level from the store rather
        // than the render closure: anything that writes the volume atom
        // without React having re-rendered yet (a restore from storage, a
        // sibling surface, a test) would otherwise leave this branch acting
        // on a stale value and unmute to silence anyway.
        if (getMasterVolume(store) === 0) {
          setMasterVolume(DEFAULT_AUDIO_VOLUME);
        }
        setMasterMuted(false);
      },
    }),
    [masterMuted, masterVolume, setMasterMuted, setMasterVolume, store],
  );
}
