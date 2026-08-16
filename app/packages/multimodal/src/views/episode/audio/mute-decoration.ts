import type { AudioTrackHandle, TimelineTrackProps } from "@fiftyone/playback";

/**
 * The per-row mute wiring both audio track decorators apply.
 *
 * `useAudioMuteTrackDecorator` (mute only) and
 * `useAudioWaveformTrackDecorator` (mute + waveform lane) otherwise repeat
 * this, which is how the two could drift apart.
 */
export function muteDecoration(
  track: AudioTrackHandle,
): Pick<TimelineTrackProps, "muted" | "onMuteClick"> {
  return {
    muted: track.muted,
    onMuteClick: () => track.setMuted(!track.muted),
  };
}
