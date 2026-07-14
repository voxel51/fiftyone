import type { SampleRendererProps } from "@fiftyone/plugins";
import type { Track } from "@fiftyone/playback";
import type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
} from "@fiftyone/playback";
import { useActiveTemporalTagFilterValues } from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";
import { temporalTagColor } from "./mcap-temporal-tag-color";

const NO_TRACKS: Track[] = [];
const NO_IDS: string[] = [];

/** Track id for a temporal-tag group. Must match `TemporalTagTimeline`'s
 * `temporal-tag::` prefix check. */
const TEMPORAL_TAG_TRACK_PREFIX = "temporal-tag::";
const temporalTagTrackId = (label: string): string =>
  `${TEMPORAL_TAG_TRACK_PREFIX}${label}`;

export interface McapTemporalTagsResult {
  tracks: Track[];
  onTagCreate: (tag: TemporalTagCreatePayload) => Promise<void>;
  onTagUpdate: (tag: TemporalTagUpdatePayload) => Promise<void>;
  onTagDelete: (event: { data?: unknown }) => Promise<void>;
}

export function useMcapTemporalTags(
  ctx: SampleRendererProps["ctx"],
): McapTemporalTagsResult {
  const {
    create,
    update,
    delete: deleteTags,
    temporalTags,
  } = useSampleRendererTemporalTags(ctx);

  const onTagDelete = useCallback(
    async (event: { data?: unknown }) => {
      const id = event.data;
      if (typeof id === "string") await deleteTags([id]);
    },
    [deleteTags],
  );

  const onTagCreate = useCallback(
    (tag: TemporalTagCreatePayload) =>
      create([
        {
          ...tag,
          start: Math.round(tag.start * 1_000_000_000),
          end: Math.round(tag.end * 1_000_000_000),
        },
      ]).then(() => undefined),
    [create],
  );

  const onTagUpdate = useCallback(
    (tag: TemporalTagUpdatePayload) =>
      update(tag.id, {
        start: Math.round(tag.start * 1_000_000_000),
        end: Math.round(tag.end * 1_000_000_000),
        tag: tag.tag,
      }).then(() => undefined),
    [update],
  );

  const tracks = useMemo<Track[]>(() => {
    if (temporalTags.length === 0) return NO_TRACKS;

    const byLabel = new Map<string, (typeof temporalTags)[number][]>();
    for (const t of temporalTags) {
      const group = byLabel.get(t.tag) ?? [];
      group.push(t);
      byLabel.set(t.tag, group);
    }

    // Sort label groups newest-first so recently created tags appear at the
    // top of the pinned section.
    const sorted = Array.from(byLabel.entries()).sort(([, a], [, b]) => {
      const tA = Math.max(
        ...a.map((t) => (t.createdAt ? Date.parse(t.createdAt) : 0)),
      );
      const tB = Math.max(
        ...b.map((t) => (t.createdAt ? Date.parse(t.createdAt) : 0)),
      );
      return tB - tA;
    });

    return sorted.map(([label, events]) => ({
      id: temporalTagTrackId(label),
      label,
      color: temporalTagColor(label),
      events: events.map((t) => ({
        data: t.id,
        label: t.tag,
        startSec: t.start / 1_000_000_000,
        endSec: t.end / 1_000_000_000,
      })),
    }));
  }, [temporalTags]);

  return { tracks, onTagCreate, onTagUpdate, onTagDelete };
}

/**
 * Track ids to auto-pin when the modal is opened from a temporal-tag-filtered
 * grid: one per tag value the grid is filtering *for*. Ids with no matching
 * track are harmless — the timeline pins only tracks that exist, so a filtered
 * tag the current sample lacks simply isn't shown.
 */
export function useFilteredTemporalTagPinnedIds(): string[] {
  const values = useActiveTemporalTagFilterValues();
  return useMemo(
    () => (values.length ? values.map(temporalTagTrackId) : NO_IDS),
    [values],
  );
}
