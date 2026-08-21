import clsx from "clsx";
import React from "react";
import { useAudio } from "../../lib/playback/use-audio";
import { VolumeOffIcon, VolumeUpIcon } from "../stableIcons";
import AudioPopover from "./AudioPopover";
import ChannelStrip from "./ChannelStrip";
import { useMasterChannel } from "./use-master-channel";
import styles from "./TimelineControls.module.css";

const ERROR_TITLE = "Audio failed to load";

/**
 * Master mute toggle + volume fader. Pressing the button opens a vertical
 * fader above it; muting happens via the mute icon inside. Renders nothing
 * unless an audio integration has published `audioAvailableAtom`.
 */
const VolumeControl: React.FC = () => {
  const { availability, masterMuted } = useAudio();
  const master = useMasterChannel();

  if (availability === "unavailable") {
    return null;
  }
  const errored = availability === "error";
  const isOff = errored || masterMuted;

  return (
    <AudioPopover
      icon={isOff ? VolumeOffIcon : VolumeUpIcon}
      ariaLabel={errored ? ERROR_TITLE : "Volume"}
      // Audio failed to load: there is nothing to adjust, so the popover
      // cannot be opened at all rather than offering dead controls.
      disabled={errored}
      triggerClassName={clsx({
        [styles.muteButtonOn]: !isOff,
        [styles.muteButtonOff]: isOff,
      })}
      panelClassName={styles.volumePopup}
      data-testid="timeline-controls-volume-toggle"
    >
      <ChannelStrip
        {...master}
        label="Volume"
        // Still the master channel — only the visible wording changed, so
        // the spoken name stays the one that identifies it.
        a11yLabel="Master"
        errored={errored}
        errorTitle={ERROR_TITLE}
        testIdPrefix="timeline-controls"
      />
    </AudioPopover>
  );
};

export default VolumeControl;
