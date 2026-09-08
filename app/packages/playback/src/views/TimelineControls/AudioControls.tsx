import React from "react";
import styles from "./TimelineControls.module.css";
import MixedAudioDropdown from "./MixedAudioDropdown";
import VolumeControl from "./VolumeControl";

/**
 * The audio half of the timeline toolbar: the master volume/mute control,
 * then the "Mixed" per-track dropdown. Rendered by `TimelineControls`
 * directly, immediately after the transport buttons — audio is playback,
 * not a host-supplied action.
 *
 * Safe to render unconditionally: both children return `null` when there is
 * no audio (and the mixer also when there is only one channel), and the
 * wrapper hides itself and its divider when it ends up with no children.
 */
const AudioControls: React.FC = () => (
  <span className={styles.audioControls} data-testid="timeline-audio-controls">
    <VolumeControl />
    <MixedAudioDropdown />
  </span>
);

export default AudioControls;
