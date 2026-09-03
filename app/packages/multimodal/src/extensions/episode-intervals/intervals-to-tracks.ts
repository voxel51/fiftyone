import type { Track } from "@fiftyone/playback";
import type { EpisodeIntervalSource, ResolvedEpisodeIntervals } from "./types";

const NS_PER_SEC = 1_000_000_000;

/**
 * Timeline track id for one row of one source. Namespacing by source id keeps
 * two sources that happen to use the same row key on separate rows, which
 * `useTimelineSections` requires (it rejects duplicate track ids).
 */
export const intervalTrackId = (sourceId: string, rowKey: string): string =>
  `${sourceId}::${rowKey}`;

/**
 * One timeline track per distinct row, each carrying that row's intervals as
 * track events. Rows are ordered alphabetically by the label they show: the
 * shared shape carries no creation time to order by, and a stable order
 * matters more than a clever one when a filter is what put these rows on
 * screen.
 */
export function intervalsToTracks(resolved: ResolvedEpisodeIntervals): Track[] {
  const { intervals } = resolved.contribution;
  if (intervals.length === 0) return [];

  const byRow = new Map<string, (typeof intervals)[number][]>();
  for (const interval of intervals) {
    const key = interval.rowKey ?? interval.eventName;
    const group = byRow.get(key) ?? [];
    group.push(interval);
    byRow.set(key, group);
  }

  return [...byRow.entries()]
    .sort(([, left], [, right]) =>
      left[0].eventName.localeCompare(right[0].eventName),
    )
    .map(([rowKey, group]) => ({
      id: intervalTrackId(resolved.source.id, rowKey),
      label: group[0].eventName,
      color: group[0].color,
      events: [...group]
        .sort((a, b) => a.startNs - b.startNs || a.endNs - b.endNs)
        .map((interval) => ({
          label: interval.eventName,
          startSec: interval.startNs / NS_PER_SEC,
          endSec: interval.endNs / NS_PER_SEC,
        })),
    }));
}

/**
 * Track ids to pin when the modal opens, one per row key each source says the
 * grid is filtered by.
 *
 * Derived from the sources' `pinnedRowKeys` rather than from their intervals,
 * so an id is produced even while that source's intervals are still loading —
 * the pin then applies as the track appears.
 */
export function intervalPinnedTrackIds(
  resolved: readonly ResolvedEpisodeIntervals[],
): string[] {
  return resolved.flatMap(({ source, contribution }) =>
    (contribution.pinnedRowKeys ?? []).map((rowKey) =>
      intervalTrackId(source.id, rowKey),
    ),
  );
}

/**
 * One timeline section per source that contributed tracks. Sections keep the
 * source's own label and order, so the drawer groups by concept ("Events",
 * "Signals") with the placement the source declared.
 */
export function intervalTimelineSections(
  resolved: readonly ResolvedEpisodeIntervals[],
): {
  readonly id: EpisodeIntervalSource["id"];
  readonly label: string;
  readonly order: number;
  readonly tracks: Track[];
}[] {
  return resolved
    .map((entry) => ({
      id: entry.source.id,
      label: entry.source.label,
      order: entry.source.order,
      tracks: intervalsToTracks(entry),
    }))
    .filter((section) => section.tracks.length > 0);
}
