/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
  Track,
  TrackEventMenuItem,
} from "@fiftyone/playback";
import {
  buildTemporalTagTracks,
  temporalTagNanoseconds,
  temporalTagTrackId,
} from "@fiftyone/playback";
import {
  useActiveTemporalTagFilterValues,
  useSampleTemporalTags,
  useSyncTemporalTagResults,
  useTemporalTagColor,
  useTemporalTagValues,
} from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useDatasetId, useModalSampleId } from "../state/accessors";

const NO_IDS: string[] = [];

export interface VideoTemporalTags {
  /** One row per tag value carried by the open sample. */
  tracks: Track[];
  /** Every tag value in the dataset, for the creation popup's dropdown. */
  existingTags: string[];
  /**
   * Rows to pin when the modal is opened from a temporal-tag-filtered grid.
   * Ids with no matching track are harmless: only tracks that exist render.
   */
  pinnedTrackIds: string[];
  /** Context-menu items for tag rows only — see `tagEventMenuItems`. */
  tagEventMenuItems: TrackEventMenuItem[];
  onTagCreate: (tag: TemporalTagCreatePayload) => Promise<void>;
  onTagUpdate: (tag: TemporalTagUpdatePayload) => Promise<void>;
}

/**
 * Temporal tags for the video sample open in the modal, shaped for
 * `TemporalTagTimeline`.
 *
 * The tag routes are sample-scoped, so this covers a video slice of a grouped
 * dataset as directly as a plain video sample: the modal's sample id is the
 * slice's own, and the tags follow it.
 *
 * Timeline time is seconds from the start of the video, which is what the
 * `DURATION_NS` index type the routes default to means — no rebasing onto a
 * recording clock, as the multimodal surface has to do.
 */
export function useVideoTemporalTags(): VideoTemporalTags {
  const datasetId = useDatasetId();
  const sampleId = useModalSampleId();
  const colorForTag = useTemporalTagColor();

  const {
    create,
    update,
    delete: deleteTags,
    temporalTags,
  } = useSampleTemporalTags({ datasetId, sampleId });

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

  const tagEventMenuItems = useMemo<TrackEventMenuItem[]>(
    () => [
      {
        label: "Delete tag",
        destructive: true,
        onSelect: async (event) => {
          if (typeof event.data === "string") await deleteTags([event.data]);
        },
      },
    ],
    [deleteTags],
  );

  const tracks = useMemo(
    () => buildTemporalTagTracks(temporalTags, colorForTag),
    [temporalTags, colorForTag],
  );

  // The dropdown offers the whole dataset's vocabulary, not just this sample's
  // tags — otherwise the first tag on any sample has nothing to pick from and
  // every label has to be retyped. The sidebar filter loads the same atom;
  // loading here too covers the modal being opened without it.
  useSyncTemporalTagResults();
  const existingTags = useTemporalTagValues();

  const filteredValues = useActiveTemporalTagFilterValues();
  const pinnedTrackIds = useMemo(
    () =>
      filteredValues.length ? filteredValues.map(temporalTagTrackId) : NO_IDS,
    [filteredValues],
  );

  return {
    tracks,
    existingTags,
    pinnedTrackIds,
    tagEventMenuItems,
    onTagCreate,
    onTagUpdate,
  };
}
