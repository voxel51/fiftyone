import type React from "react";

/**
 * The contract every mixer channel shares.
 *
 * `VolumeControl` (the toolbar's master fader) and `TrackFaderRow` (a row
 * in the mixer) render the same channel: label, mute toggle, fader,
 * readout. Keeping the props and the derived state in one place stops the
 * two from drifting.
 */
export interface ChannelProps {
  label: string;
  /**
   * Name used to build the mute button's and fader's accessible names, for
   * when the visible `label` doesn't read well spoken aloud — the volume
   * popover shows "Volume" but is still the master channel, and "Master
   * Volume" would announce as "Master Volume volume". Defaults to `label`.
   */
  a11yLabel?: string;
  /** Current volume, in [0, 1]. */
  value: number;
  muted: boolean;
  /** Renders disabled; the fader reads zero regardless of `value`. */
  errored?: boolean;
  errorTitle?: string;
  /**
   * Set the level. MUST also clear `muted` — dragging a fader up off zero is
   * how a user unmutes, and leaving the flag set makes the gesture a no-op:
   * `shown` reports 0 while muted, so the knob springs straight back. See
   * `useMasterChannel` for the reference implementation.
   */
  onVolumeChange(next: number): void;
  onMute(): void;
  /**
   * Kept distinct from `onVolumeChange`'s implicit unmute so the caller can
   * apply "never unmute into silence" (restore a default level) only for
   * this explicit gesture — a slider dragged to a specific value should
   * never be second-guessed by that safeguard.
   */
  onUnmute(): void;
  /** Prefix for `data-testid`s, so multiple channels stay queryable. */
  testIdPrefix: string;
  /**
   * Short status rendered beside the label, on the line the label already
   * occupies. Deliberately inline: a note that appears below the channel
   * would grow the panel the moment it showed up.
   */
  note?: React.ReactNode;
}

/** State both orientations derive identically from the props above. */
export function channelState(props: ChannelProps) {
  const isOff = Boolean(props.errored) || props.muted;
  const name = props.a11yLabel ?? props.label;
  return {
    isOff,
    /** What the fader displays: zero while muted or errored. */
    shown: isOff ? 0 : props.value,
    muteLabel: props.muted ? `Unmute ${name}` : `Mute ${name}`,
    /** Accessible name for the fader, in either orientation. */
    faderLabel: `${name} volume`,
    /** Dragging to zero mutes rather than storing a zero level. */
    handleChange(next: number) {
      if (next <= 0) {
        props.onMute();
        return;
      }
      props.onVolumeChange(next);
    },
  };
}
