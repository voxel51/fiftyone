import React from "react";
import styles from "./TimelineControls.module.css";
import MixedAudioDropdown from "./MixedAudioDropdown";
import VolumeControl from "./VolumeControl";

/**
 * The audio half of the timeline toolbar: the master volume/mute control
 * plus the "Mixed" per-track dropdown. Passed as `TimelineWithTracks`'s
 * `trailingActions` by any surface that wants audio controls — not
 * hardcoded into `TimelineControls` itself, since not every timeline
 * consumer has audio.
 */
const AudioControls: React.FC = () => (
  <span className={styles.audioControls} data-testid="timeline-audio-controls">
    <MixedAudioDropdown />
    <VolumeControl />
  </span>
);

export default AudioControls;
