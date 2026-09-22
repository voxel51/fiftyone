import type { Track } from "../../lib/tracks/TrackProvider";

/**
 * Track-id namespace for temporal-tag rows.
 *
 * Hosts mint ids with {@link temporalTagTrackId} and the timeline recognises
 * them with {@link isTemporalTagTrackId} — the two must agree, so both live
 * here rather than being spelled out again in each host.
 */
export const TEMPORAL_TAG_TRACK_PREFIX = "temporal-tag::";

/** Track id for the row holding every interval carrying `label`. */
export const temporalTagTrackId = (label: string): string =>
  `${TEMPORAL_TAG_TRACK_PREFIX}${label}`;

/** Whether `id` addresses a temporal-tag row rather than a host track. */
export const isTemporalTagTrackId = (id: string): boolean =>
  id.startsWith(TEMPORAL_TAG_TRACK_PREFIX);

const NANOSECONDS_PER_SECOND = 1_000_000_000;

/** Timeline seconds to the nanoseconds the tag routes store. */
export const temporalTagNanoseconds = (seconds: number): number =>
  Math.round(seconds * NANOSECONDS_PER_SECOND);

/** Stored nanoseconds back to timeline seconds. */
export const temporalTagSeconds = (nanoseconds: number): number =>
  nanoseconds / NANOSECONDS_PER_SECOND;

/** The persisted temporal-tag fields a timeline row is built from. */
export interface TemporalTagInterval {
  readonly id: string;
  readonly tag: string;
  /** Interval bounds in nanoseconds, as the tag routes store them. */
  readonly start: number;
  readonly end: number;
  readonly createdAt?: string;
}

const NO_TRACKS: Track[] = [];

/**
 * One row per tag value, each holding that value's intervals.
 *
 * Rows are ordered by their newest interval so a tag just created lands at the
 * top of the pinned section rather than wherever its label happens to sort.
 */
export function buildTemporalTagTracks(
  tags: readonly TemporalTagInterval[],
  colorForTag: (tag: string) => string,
): Track[] {
  if (tags.length === 0) return NO_TRACKS;

  const byLabel = new Map<string, TemporalTagInterval[]>();
  for (const tag of tags) {
    const group = byLabel.get(tag.tag) ?? [];
    group.push(tag);
    byLabel.set(tag.tag, group);
  }

  const sorted = Array.from(byLabel.entries()).sort(([, a], [, b]) => {
    const newest = (group: TemporalTagInterval[]) =>
      Math.max(
        ...group.map((t) => (t.createdAt ? Date.parse(t.createdAt) : 0)),
      );
    return newest(b) - newest(a);
  });

  return sorted.map(([label, events]) => ({
    id: temporalTagTrackId(label),
    label,
    color: colorForTag(label),
    events: events.map((tag) => ({
      data: tag.id,
      label: tag.tag,
      startSec: temporalTagSeconds(tag.start),
      endSec: temporalTagSeconds(tag.end),
    })),
  }));
}
