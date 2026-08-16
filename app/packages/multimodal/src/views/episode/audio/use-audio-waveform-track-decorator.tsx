// ---------------------------------------------------------------------------
// Stretch goal (plan §8/§10): a track row in the MAIN timeline whose lane
// IS a waveform, with a mute button in place of the pin button. Built on
// TimelineTrack's `laneOverride`/`onMuteClick`/`muted` props — no new
// coordinate math, since the row's lane already shares the same
// `viewStart`/`viewEnd` the WaveformViewer canvas reads.
//
// This is a `decorateTrack` factory: a consumer that already registers a
// `Track` (via `TrackProvider`) whose `id` matches a registered
// `useAudio()` track passes the returned function as
// `TimelineWithTracksProps.decorateTrack` to get the waveform lane + mute
// button for free, without `TimelineWithTracks`/`TimelineTrack` needing
// any audio-specific knowledge.
// ---------------------------------------------------------------------------

import { useAudio } from "@fiftyone/playback";
import type { Track, TimelineTrackProps } from "@fiftyone/playback";
import { useCallback } from "react";
import type { PeakPyramid } from "../../../audio/peak-pyramid";
import WaveformViewer from "./WaveformViewer";

/**
 * Returns a `decorateTrack` function that overrides one row's lane with a
 * `WaveformViewer` and its pin button with a mute toggle, for whichever
 * registered `Track` id matches a `useAudio()` track. Every other row is
 * left untouched (`decorateTrack` returning `{}` is a no-op merge).
 *
 * `peaksByTrackId` supplies real decoded waveform data per track id (e.g.
 * from `useMcapAudioStream(...).waveformPeaks`) — a track with no entry
 * yet (still decoding, or Phase 2 not wired for that source) renders no
 * lane override, i.e. behaves like a normal track until data arrives.
 */
export function useAudioWaveformTrackDecorator(
  peaksByTrackId: Readonly<Record<string, PeakPyramid>>,
): (track: Track, pinned: boolean) => Partial<TimelineTrackProps> {
  const { tracks } = useAudio();

  return useCallback(
    (track: Track): Partial<TimelineTrackProps> => {
      const audioTrack = tracks.find((candidate) => candidate.id === track.id);
      const peaks = peaksByTrackId[track.id];
      if (!audioTrack || !peaks) {
        return {};
      }
      return {
        muted: audioTrack.muted,
        onMuteClick: () => audioTrack.setMuted(!audioTrack.muted),
        laneOverride: (
          <WaveformViewer
            tracks={[
              {
                label: audioTrack.label,
                pyramid: peaks,
                trackId: audioTrack.id,
              },
            ]}
          />
        ),
      };
    },
    [tracks, peaksByTrackId],
  );
}
