import {
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import { DEFAULT_TRACK_VOLUME } from "../../lib/playback/atoms";
import { useAudio } from "../../lib/playback/use-audio";
import { SlidersIcon } from "../stableIcons";
import AudioPopover from "./AudioPopover";
import styles from "./TimelineControls.module.css";
import TrackFaderRow from "./TrackFaderRow";
import { useMasterChannel } from "./use-master-channel";

/** Per-track audio mixer: a Master row plus one row per registered track. */
const MixedAudioDropdown: React.FC = () => {
  const { availability, tracks, masterMuted } = useAudio();
  const master = useMasterChannel();

  if (tracks.length === 0 || availability === "unavailable") {
    return null;
  }
  // Audio failed to load: keep the button visible so the failure is
  // discoverable, but disabled — every control inside would be inert.
  const errored = availability === "error";

  return (
    <AudioPopover
      icon={SlidersIcon}
      panelClassName={styles.mixedPanel}
      disabled={errored}
      ariaLabel={errored ? "Audio failed to load" : "Audio mixer"}
      closable
      data-testid="timeline-controls-mixed"
    >
      <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Text color={TextColor.Primary} variant={TextVariant.Label}>
            Master
          </Text>
          <TrackFaderRow
            {...master}
            label="Master"
            testIdPrefix="timeline-mixed-master"
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
