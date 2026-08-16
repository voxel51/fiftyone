import clsx from "clsx";
import React from "react";
import { DEFAULT_AUDIO_VOLUME } from "../../lib/playback/atoms";
import { useAudio } from "../../lib/playback/use-audio";
import { VolumeOffIcon, VolumeUpIcon } from "../stableIcons";
import AudioPopover from "./AudioPopover";
import ChannelStrip from "./ChannelStrip";
import styles from "./TimelineControls.module.css";

const ERROR_TITLE = "Audio failed to load";

/**
 * Master mute toggle + volume fader. Pressing the button opens a vertical
 * fader above it; muting happens via the mute icon inside. Renders nothing
 * unless an audio integration has published `audioAvailableAtom`.
 */
const VolumeControl: React.FC = () => {
  const { availability, masterMuted, masterVolume, setMasterMuted, setMasterVolume } =
    useAudio();

  if (availability === "unavailable") {
    return null;
  }
  const errored = availability === "error";
  const isOff = errored || masterMuted;

  return (
    <AudioPopover
      icon={isOff ? VolumeOffIcon : VolumeUpIcon}
      ariaLabel={errored ? ERROR_TITLE : "Volume"}
      triggerClassName={clsx({
        [styles.muteButtonOn]: !isOff,
        [styles.muteButtonOff]: isOff,
      })}
      panelClassName={styles.volumePopup}
      data-testid="timeline-controls-volume"
    >
      <ChannelStrip
        label="Master"
        value={masterVolume}
        muted={masterMuted}
        errored={errored}
        errorTitle={ERROR_TITLE}
        testIdPrefix="timeline-controls"
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
    </AudioPopover>
  );
};

export default VolumeControl;
