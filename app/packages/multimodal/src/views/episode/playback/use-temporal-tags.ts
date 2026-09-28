import type { SampleRendererProps } from "@fiftyone/plugins";
import type { Track } from "@fiftyone/playback";
import {
  buildTemporalTagTracks,
  temporalTagNanoseconds,
  temporalTagTrackId,
} from "@fiftyone/playback";
import type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
} from "@fiftyone/playback";
import {
  useActiveTemporalTagFilterValues,
  useSyncTemporalTagResults,
  useTemporalTagColor,
  useTemporalTagValues,
} from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";

const NO_IDS: string[] = [];

export interface TemporalTagsResult {
  tracks: Track[];
  /** Every tag label in the dataset, for the creation popup's dropdown. */
  existingTags: string[];
  onTagCreate: (tag: TemporalTagCreatePayload) => Promise<void>;
  onTagUpdate: (tag: TemporalTagUpdatePayload) => Promise<void>;
  onTagDelete: (event: { data?: unknown }) => Promise<void>;
}

export function useTemporalTags(
  ctx: SampleRendererProps["ctx"],
): TemporalTagsResult {
  const {
    create,
    update,
    delete: deleteTags,
    temporalTags,
  } = useSampleRendererTemporalTags(ctx);
  const colorForTag = useTemporalTagColor();

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
          start: temporalTagNanoseconds(tag.start),
          end: temporalTagNanoseconds(tag.end),
        },
      ]).then(() => undefined),
    [create],
  );

  const onTagUpdate = useCallback(
    (tag: TemporalTagUpdatePayload) =>
      update(tag.id, {
        start: temporalTagNanoseconds(tag.start),
        end: temporalTagNanoseconds(tag.end),
        tag: tag.tag,
      }).then(() => undefined),
    [update],
  );

  const tracks = useMemo<Track[]>(
    () => buildTemporalTagTracks(temporalTags, colorForTag),
    [temporalTags, colorForTag],
  );

  // The dropdown offers the whole dataset's vocabulary, not just this
  // sample's tags — otherwise the first tag on any sample has nothing to pick
  // from and every label has to be retyped. The sidebar filter loads the same
  // atom; loading here too covers the modal being opened without it.
  useSyncTemporalTagResults();
  const existingTags = useTemporalTagValues();

  return { tracks, existingTags, onTagCreate, onTagUpdate, onTagDelete };
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
