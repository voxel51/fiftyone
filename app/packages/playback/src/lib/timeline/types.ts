/**
 * Metadata for a single track on the timeline — its visual treatment
 * and temporal bounds. Times are expressed in the timeline's native
 * frame numbers (not seconds): `start` and `end` are inclusive frame
 * indices, and `events` is an optional list of per-frame markers in
 * the same unit.
 */
export interface TimelineTrackData {
  /** Stable id; used as the key when reconciling track rows. */
  id: string;
  /** Foreground color for the track bar (any CSS color string). */
  color: string;
  /** Optional background color for the lane (any CSS color string). */
  bg?: string;
  /** Inclusive start frame number of the track's range. */
  start: number;
  /** Inclusive end frame number of the track's range. */
  end: number;
  /** Optional per-frame markers rendered on top of the track. */
  events?: number[];
}
