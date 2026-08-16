import {
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import { DEFAULT_AUDIO_VOLUME, DEFAULT_TRACK_VOLUME } from "../../lib/playback/atoms";
import { useAudio } from "../../lib/playback/use-audio";
import { SlidersIcon } from "../stableIcons";
import AudioPopover from "./AudioPopover";
import styles from "./TimelineControls.module.css";
import TrackFaderRow from "./TrackFaderRow";

/** Per-track audio mixer: a Master row plus one row per registered track. */
const MixedAudioDropdown: React.FC = () => {
  const { tracks, masterMuted, masterVolume, setMasterMuted, setMasterVolume } =
    useAudio();

  if (tracks.length === 0) {
    return null;
  }

  return (
    <AudioPopover
      icon={SlidersIcon}
      ariaLabel="Audio mixer"
      panelClassName={styles.mixedPanel}
      closable
      data-testid="timeline-controls-mixed"
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Text color={TextColor.Primary} variant={TextVariant.Label}>
            Master
          </Text>
          <TrackFaderRow
            label="Master"
            value={masterVolume}
            muted={masterMuted}
            testIdPrefix="timeline-mixed-master"
            onVolumeChange={(next) => {
              setMasterVolume(next);
              setMasterMuted(false);
            }}
            onMute={() => setMasterMuted(true)}
            onUnmute={() => {
              // never unmute into silence
              if (masterVolume === 0) {
                setMasterVolume(DEFAULT_AUDIO_VOLUME);
              }
              setMasterMuted(false);
            }}
          />
        </Stack>

        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Text color={TextColor.Primary} variant={TextVariant.Label}>
            Tracks
          </Text>
          <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
            {tracks.map((track) => (
              <TrackFaderRow
                key={track.id}
                label={track.label}
                value={track.volume}
                muted={track.muted}
                testIdPrefix={`timeline-mixed-track-${track.id}`}
                onVolumeChange={(next) => track.setVolume(next)}
                onMute={() => track.setMuted(true)}
                onUnmute={() => {
                  // never unmute into silence
                  if (track.volume === 0) {
                    track.setVolume(DEFAULT_TRACK_VOLUME);
                  }
                  track.setMuted(false);
                }}
              />
            ))}
          </Stack>
        </Stack>

        {masterMuted ? (
          <Text color={TextColor.Secondary} variant={TextVariant.Caption}>
            Master is muted — unmute to hear these tracks.
          </Text>
        ) : null}
      </Stack>
    </AudioPopover>
  );
};

export default MixedAudioDropdown;
