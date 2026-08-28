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

  // A single track has nothing to mix: the master volume control beside it
  // already governs the only channel, so a mixer would just duplicate it.
  // (`AudioControls` documents this gate; the check used to read `=== 0`.)
  if (tracks.length <= 1 || availability === "unavailable") {
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
        {/* No section heading: it only ever held one row, and "Master" over
            a row also labelled "Master" said the same word twice. The row
            names itself instead. */}
        <TrackFaderRow
          {...master}
          label="Master Volume"
          // Beside the header, not under the panel: as a trailing block it
          // appeared and vanished with the mute state and resized the popover
          // under the cursor.
          note={masterMuted ? "muted — tracks are silent" : undefined}
          // "Master Volume volume" is what the fader would otherwise
          // announce — keep the spoken name to the channel itself.
          a11yLabel="Master"
          testIdPrefix="timeline-mixed-master"
        />

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
                onVolumeChange={(next) => {
                  // Dragging up off zero is an unmute gesture — without
                  // clearing the flag the row reads 0 and the knob snaps
                  // back. Mirrors `useMasterChannel.onVolumeChange`.
                  track.setVolume(next);
                  track.setMuted(false);
                }}
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
      </Stack>
    </AudioPopover>
  );
};

export default MixedAudioDropdown;
