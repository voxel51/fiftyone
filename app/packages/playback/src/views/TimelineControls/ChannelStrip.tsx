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
 * The vertical channel used by the volume popover: label on top, then the
 * fader, its numeric readout, and a mute toggle at the bottom (orange when
 * audible, gray when muted). `TrackFaderRow` is the horizontal counterpart
 * used by the mixer; both derive their state from `channelState`.
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
  const { isOff, shown, muteLabel, faderLabel, handleChange } =
    channelState(props);

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
      <VerticalFader
        value={shown}
        muted={isOff}
        disabled={errored}
        onChange={handleChange}
        ariaLabel={faderLabel}
        data-testid={`${testIdPrefix}-volume`}
      />
      <Text
        className={styles.channelStripValue}
        color={TextColor.Secondary}
        variant={TextVariant.Caption}
      >
        {Math.round(shown * 100)}%
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
    </Stack>
  );
};

export default ChannelStrip;
