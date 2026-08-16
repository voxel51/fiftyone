// ---------------------------------------------------------------------------
// Lighter sibling of `use-audio-waveform-track-decorator.tsx`: gives an
// audio-sourced `Track` row a mute button in place of its pin button,
// without requiring decoded peak data (no `laneOverride`). Use this when
// only the mute affordance is needed on the main timeline; swap to the
// waveform decorator once per-track peak data is available at the call
// site.
// ---------------------------------------------------------------------------

import { useAudio } from "@fiftyone/playback";
import type { Track, TimelineTrackProps } from "@fiftyone/playback";
import { useCallback } from "react";

/**
 * Returns a `decorateTrack` function that swaps the pin button for a mute
 * toggle on whichever `Track` id matches a registered `useAudio()` track.
 * Every other row is left untouched (`{}` is a no-op merge).
 */
export function useAudioMuteTrackDecorator(): (
  track: Track,
  pinned: boolean,
) => Partial<TimelineTrackProps> {
  const { tracks } = useAudio();

  return useCallback(
    (track: Track): Partial<TimelineTrackProps> => {
      const audioTrack = tracks.find((candidate) => candidate.id === track.id);
      if (!audioTrack) {
        return {};
      }
      return {
        muted: audioTrack.muted,
        onMuteClick: () => audioTrack.setMuted(!audioTrack.muted),
      };
    },
    [tracks],
  );
}
