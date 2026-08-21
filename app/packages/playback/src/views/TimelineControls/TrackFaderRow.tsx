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
import { channelState, type ChannelProps } from "./channel-contract";
import styles from "./TimelineControls.module.css";

/**
 * One mixer row: label on top, then a mute toggle (leftmost, orange while
 * audible / gray while muted) followed by a horizontal slider and a
 * numeric readout — shared by the Mixer dialog's Master row and every
 * per-track row.
 */
const TrackFaderRow: React.FC<ChannelProps> = (props) => {
  const {
    label,
    errored = false,
    errorTitle,
    muted,
    note,
    onMute,
    onUnmute,
    testIdPrefix,
  } = props;
  const { isOff, shown, muteLabel, faderLabel, handleChange } =
    channelState(props);

  return (
    <div
      className={styles.trackFaderRow}
      data-testid={testIdPrefix}
      title={errored ? errorTitle : undefined}
    >
      <div className={styles.trackFaderLabelRow}>
        <Text
          className={styles.trackFaderLabel}
          color={TextColor.Primary}
          title={label}
          variant={TextVariant.Xs}
        >
          {label}
        </Text>
        {note ? (
          <Text
            className={styles.trackFaderNote}
            color={TextColor.Secondary}
            data-testid={`${testIdPrefix}-note`}
            variant={TextVariant.Caption}
          >
            {note}
          </Text>
        ) : null}
      </div>
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
          // Matches ChannelStrip: an errored channel's fader is inert, not
          // merely labelled as such. voodo's slider has no `disabled` prop,
          // so the class removes pointer events.
          className={clsx(styles.trackFaderSlider, {
            [styles.faderDisabled]: errored,
          })}
          data-testid={`${testIdPrefix}-volume`}
          aria-label={faderLabel}
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
