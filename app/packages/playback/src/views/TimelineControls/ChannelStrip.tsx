import {
  Align,
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
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
import VerticalFader from "./VerticalFader";

/**
 * One mixer channel: label on top, a mute toggle (orange when audible, gray
 * when muted), a vertical fader, and a numeric readout underneath — the
 * shared shape for both the "Master" row and every per-track row in the
 * Mixed dropdown.
 */
const ChannelStrip: React.FC<ChannelProps> = (props) => {
  const {
    label,
    errored = false,
    errorTitle,
    muted,
    onMute,
    onUnmute,
    testIdPrefix,
  } = props;
  const { isOff, shown, muteLabel, handleChange } = channelState(props);

  return (
    <Stack
      align={Align.Center}
      className={styles.channelStrip}
      orientation={Orientation.Column}
      spacing={Spacing.Xs}
      title={errored ? errorTitle : undefined}
    >
      <Text
        className={styles.channelStripLabel}
        color={TextColor.Primary}
        title={label}
        variant={TextVariant.Xs}
      >
        {label}
      </Text>
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
      <VerticalFader
        value={shown}
        muted={isOff}
        disabled={errored}
        onChange={handleChange}
        ariaLabel={`${label} volume`}
        data-testid={`${testIdPrefix}-volume`}
      />
      <Text
        className={styles.channelStripValue}
        color={TextColor.Secondary}
        variant={TextVariant.Caption}
      >
        {Math.round(shown * 100)}%
      </Text>
    </Stack>
  );
};

export default ChannelStrip;
