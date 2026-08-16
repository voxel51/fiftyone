import {
  Button,
  SingleValueSlider,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";
import { VolumeOffIcon, VolumeUpIcon } from "../stableIcons";
import styles from "./TimelineControls.module.css";

export interface TrackFaderRowProps {
  label: string;
  /** Current volume, in [0, 1]. */
  value: number;
  muted: boolean;
  errored?: boolean;
  errorTitle?: string;
  onVolumeChange(next: number): void;
  onMute(): void;
  /**
   * Kept distinct from `onVolumeChange`'s implicit unmute so the caller can
   * apply "never unmute into silence" (restore a default level) only for
   * this explicit gesture.
   */
  onUnmute(): void;
  testIdPrefix: string;
}

/**
 * One mixer row: label on top, then a mute toggle (leftmost, orange while
 * audible / gray while muted) followed by a horizontal slider and a
 * numeric readout — shared by the Mixer dialog's Master row and every
 * per-track row.
 */
const TrackFaderRow: React.FC<TrackFaderRowProps> = ({
  label,
  value,
  muted,
  errored = false,
  errorTitle,
  onVolumeChange,
  onMute,
  onUnmute,
  testIdPrefix,
}) => {
  const shown = errored || muted ? 0 : value;
  const isOff = errored || muted;
  const muteLabel = muted ? `Unmute ${label}` : `Mute ${label}`;

  const handleChange = (next: number) => {
    if (next <= 0) {
      onMute();
      return;
    }
    onVolumeChange(next);
  };

  return (
    <div
      className={styles.trackFaderRow}
      title={errored ? errorTitle : undefined}
    >
      <Text
        className={styles.trackFaderLabel}
        color={TextColor.Primary}
        title={label}
        variant={TextVariant.Xs}
      >
        {label}
      </Text>
      <div className={styles.trackFaderControls}>
        <Button
          variant={Variant.Icon}
          size={Size.Xs}
          className={clsx(styles.iconButton, {
            [styles.muteButtonOn]: !isOff,
            [styles.muteButtonOff]: isOff,
          })}
          data-testid={`${testIdPrefix}-mute`}
          disabled={errored}
          leadingIcon={isOff ? VolumeOffIcon : VolumeUpIcon}
          aria-label={errored ? errorTitle : muteLabel}
          aria-pressed={muted}
          onClick={muted ? onUnmute : onMute}
        />
        <SingleValueSlider
          bare
          className={styles.trackFaderSlider}
          data-testid={`${testIdPrefix}-volume`}
          aria-label={`${label} volume`}
          aria-disabled={errored}
          min={0}
          max={1}
          step={0.01}
          debounceDelay={0}
          value={shown}
          onChange={handleChange}
        />
        <Text
          className={styles.trackFaderValue}
          color={TextColor.Secondary}
          variant={TextVariant.Caption}
        >
          {Math.round(shown * 100)}%
        </Text>
      </div>
    </div>
  );
};

export default TrackFaderRow;
