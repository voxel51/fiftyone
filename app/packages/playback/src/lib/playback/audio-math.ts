// ---------------------------------------------------------------------------
// Pure master-fader arithmetic for the multi-track audio model. Kept
// store-free and side-effect-free so it's trivially unit-testable and so
// every audio source (native <audio> element today, Web-Audio GainNode
// sources later) computes what to apply to its medium the same way.
// ---------------------------------------------------------------------------

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * A track is audible only if neither it nor the master is muted; the
 * effective level is the product of the two faders. This is the single
 * source of truth every audio source's own hook calls to compute what to
 * actually apply to its medium (`element.volume`, a `GainNode.gain`, …).
 */
export function effectiveVolume(args: {
  trackVolume: number;
  trackMuted: boolean;
  masterVolume: number;
  masterMuted: boolean;
}): number {
  if (args.trackMuted || args.masterMuted) {
    return 0;
  }
  return clamp01(args.trackVolume) * clamp01(args.masterVolume);
}

/** Muted if either the track or the master fader is muted. */
export function effectiveMuted(args: {
  trackMuted: boolean;
  masterMuted: boolean;
}): boolean {
  return args.trackMuted || args.masterMuted;
}

/**
 * The volume level a source should report/restore-to, independent of
 * mute — `trackVolume * masterVolume` with no zeroing. For media types
 * with their own separate mute mechanism (e.g. `HTMLMediaElement.muted`),
 * this is what `.volume` should carry so unmuting is instant and doesn't
 * wait on a volume update; `effectiveMuted` drives the actual silence.
 * Sources with no separate mute concept (e.g. a Web Audio `GainNode`)
 * should use `effectiveVolume` instead, which zeros on mute.
 */
export function volumeMagnitude(args: {
  trackVolume: number;
  masterVolume: number;
}): number {
  return clamp01(args.trackVolume) * clamp01(args.masterVolume);
}
