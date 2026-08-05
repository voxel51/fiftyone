import { Button, SingleValueSlider, Size, Variant } from "@voxel51/voodo";
import React from "react";
import { DEFAULT_AUDIO_VOLUME } from "../../lib/playback/atoms";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  getAudioVolume,
  setAudioMuted,
  setAudioVolume,
} from "../../lib/playback/store-access";
import {
  useAudioAvailable,
  useAudioMuted,
  useAudioVolume,
} from "../../lib/playback/use-playback-state";
import { VolumeOffIcon, VolumeUpIcon } from "../stableIcons";
import styles from "./TimelineControls.module.css";

/** Arrow-key volume increment. */
const KEY_STEP = 0.05;

/**
 * Mute toggle + volume slider for timeline audio. Renders nothing unless
 * an audio integration has published `audioAvailableAtom`.
 *
 * The slider shows zero while muted; the stored volume is untouched so
 * unmute restores it.
 */
const VolumeControl: React.FC = () => {
  const available = useAudioAvailable();
  const muted = useAudioMuted();
  const volume = useAudioVolume();
  const store = usePlaybackStore();

  if (!available) {
    return null;
  }

  const shown = muted ? 0 : volume;

  const unmute = () => {
    // never unmute into silence
    if (getAudioVolume(store) === 0) {
      setAudioVolume(store, DEFAULT_AUDIO_VOLUME);
    }
    setAudioMuted(store, false);
  };

  const handleChange = (next: number) => {
    if (next <= 0) {
      // mute without clobbering the stored level
      setAudioMuted(store, true);
      return;
    }
    setAudioVolume(store, next);
    setAudioMuted(store, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!dir) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    handleChange(Math.min(1, Math.max(0, shown + dir * KEY_STEP)));
  };

  return (
    <span
      className={styles.volumeGroup}
      data-testid="timeline-controls-volume-group"
      onKeyDown={handleKeyDown}
    >
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="timeline-controls-mute"
        leadingIcon={muted ? VolumeOffIcon : VolumeUpIcon}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={muted ? unmute : () => setAudioMuted(store, true)}
      />
      <SingleValueSlider
        bare
        className={styles.volumeSlider}
        data-testid="timeline-controls-volume"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        debounceDelay={0}
        value={shown}
        onChange={handleChange}
      />
    </span>
  );
};

export default VolumeControl;
