/**
 * The contract every mixer channel shares, whatever its orientation.
 *
 * `ChannelStrip` (vertical, volume popover) and `TrackFaderRow`
 * (horizontal, mixer dialog) render the same channel: label, mute toggle,
 * fader, readout. Keeping the props and the derived state in one place
 * stops the two from drifting — they already had, with only one disabling
 * its fader on `errored`.
 */
export interface ChannelProps {
  label: string;
  /** Current volume, in [0, 1]. */
  value: number;
  muted: boolean;
  /** Renders disabled; the fader reads zero regardless of `value`. */
  errored?: boolean;
  errorTitle?: string;
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
}

/** State both orientations derive identically from the props above. */
export function channelState(props: ChannelProps) {
  const isOff = Boolean(props.errored) || props.muted;
  return {
    isOff,
    /** What the fader displays: zero while muted or errored. */
    shown: isOff ? 0 : props.value,
    muteLabel: props.muted ? `Unmute ${props.label}` : `Mute ${props.label}`,
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
