import React, { useCallback, useMemo } from "react";
import { TIMELINE_LABEL_WIDTH } from "../../lib/constants";
import {
  useTracks,
  useTrackPinning,
  type Track,
} from "../../lib/tracks/TrackProvider";
import { TemporalTagProvider } from "./TemporalTagContext";
import type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
} from "./TemporalTagContext";
import TemporalTagButton from "./TemporalTagButton";
import TemporalTagPopup from "./TemporalTagPopup";
import TemporalTagRangeOverlay from "./TemporalTagRangeOverlay";
import {
  isTemporalTagTrackId,
  temporalTagTrackId,
} from "./temporal-tag-tracks";
import { useTemporalTagMode } from "./use-temporal-tag-mode";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";
import type {
  TimelineTrackProps,
  TrackEventMenuItem,
} from "../TimelineTrack/TimelineTrack";
import type { TimelineWithTracksProps } from "../TimelineWithTracks/TimelineWithTracks";

export interface TemporalTagTimelineProps extends TimelineWithTracksProps {
  onTagCreate?: (tag: TemporalTagCreatePayload) => Promise<void>;
  /** When provided, adds an "Edit tag" context-menu action that opens the
   *  popup pre-filled to mutate that tag's time range / label. */
  onTagUpdate?: (tag: TemporalTagUpdatePayload) => Promise<void>;
  /**
   * Context-menu items for temporal-tag rows only — a host's "Delete tag"
   * belongs here, not in {@link TimelineWithTracksProps.eventMenuItems}, which
   * reaches every row on the timeline. A surface that mixes tag rows with its
   * own tracks (the video timeline carries object and temporal-detection rows
   * alongside them) would otherwise offer tag actions on events that are not
   * tags, addressed by ids the tag routes have never seen.
   */
  tagEventMenuItems?: TrackEventMenuItem[];
  /**
   * Tag labels offered by the "add to existing tag" dropdown. Hosts pass the
   * whole dataset's labels; without it the dropdown can only offer what the
   * current sample already carries, which is nothing on the first tag of a
   * dataset. Merged with the labels on the timeline, so a tag created in this
   * session is selectable before the host's list refreshes.
   */
  existingTags?: readonly string[];
}

/**
 * Drop-in replacement for TimelineWithTracks that layers temporal-tag
 * functionality on top. Owns the TemporalTagProvider, the range-selection
 * overlay, the tag-mode button, and the creation popup — keeping all of
 * that out of the generic TimelineWithTracks component.
 *
 * Must be rendered inside a TrackProvider and PlaybackProvider.
 */
const TemporalTagTimeline: React.FC<TemporalTagTimelineProps> = ({
  onTagCreate,
  onTagUpdate,
  existingTags: hostTags,
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  rulerOverlay,
  extraActions,
  tagEventMenuItems,
  decorateTrack,
  ...timelineProps
}) => {
  const tracks = useTracks();
  const { setPinned } = useTrackPinning();
  const { state, actions } = useTemporalTagMode();

  const existingTags = useMemo(() => {
    const onTimeline = tracks
      .filter((t) => isTemporalTagTrackId(t.id))
      .map((t) => t.label);
    // Host list first: it is the dataset-wide vocabulary, and the timeline
    // only contributes labels it hasn't caught up with yet.
    return Array.from(new Set([...(hostTags ?? []), ...onTimeline]));
  }, [tracks, hostTags]);

  // Pin the tag's track on creation so a new tag is visible without the user
  // hunting for it in the drawer. The track for a brand-new label does not
  // exist until the write round-trips, but pinning is by id and the timeline
  // renders only pinned tracks that exist, so pinning ahead is safe.
  const handleTagCreate = useMemo(() => {
    if (!onTagCreate) return undefined;
    return async (tag: TemporalTagCreatePayload) => {
      await onTagCreate(tag);
      setPinned(temporalTagTrackId(tag.tag), true);
    };
  }, [onTagCreate, setPinned]);

  const tagContextValue = {
    state,
    actions,
    onTagCreate: handleTagCreate,
    onTagUpdate,
    existingTags,
  };

  // Prepend an "Edit tag" action (opens the popup pre-filled) to the host's
  // tag-row items when editing is wired in.
  const tagRowMenuItems = useMemo<TrackEventMenuItem[] | undefined>(() => {
    if (!onTagUpdate) return tagEventMenuItems;
    const editItem: TrackEventMenuItem = {
      label: "Edit tag",
      onSelect: (event, anchor) => {
        if (typeof event.data !== "string" || !anchor) return;
        actions.startEdit(
          {
            id: event.data,
            start: event.startSec,
            end: event.endSec ?? event.startSec,
            label: event.label ?? "",
          },
          anchor,
        );
      },
    };
    return [editItem, ...(tagEventMenuItems ?? [])];
  }, [onTagUpdate, tagEventMenuItems, actions]);

  // Attach the tag actions to tag rows only. `decorateTrack`'s result is
  // cached per (callback identity, track), so every input this closure reads
  // has to appear in the dependency list — see that prop's doc.
  const decorateTagTrack = useCallback(
    (track: Track, pinned: boolean): Partial<TimelineTrackProps> => {
      const decoration = decorateTrack?.(track, pinned) ?? {};
      if (!tagRowMenuItems || !isTemporalTagTrackId(track.id)) {
        return decoration;
      }

      return { ...decoration, eventMenuItems: tagRowMenuItems };
    },
    [decorateTrack, tagRowMenuItems],
  );

  return (
    <TemporalTagProvider value={tagContextValue}>
      <TimelineWithTracks
        {...timelineProps}
        decorateTrack={decorateTagTrack}
        labelWidth={requestedLabelWidth}
        // Compose caller-provided slot content with the tag UI instead of
        // replacing it — hosts inject their own controls (e.g. a timestamp
        // readout) through the same slots. Resolved against
        // TimelineWithTracks's *effective* label width (a render prop,
        // since that width can collapse to 0 independently of
        // `requestedLabelWidth` — see that prop's doc) so the overlay's own
        // offset math never drifts from where the gutter actually renders.
        rulerOverlay={(effectiveLabelWidth: number) => (
          <>
            {typeof rulerOverlay === "function"
              ? rulerOverlay(effectiveLabelWidth)
              : rulerOverlay}
            <TemporalTagRangeOverlay labelWidth={effectiveLabelWidth} />
          </>
        )}
        extraActions={
          <>
            {extraActions}
            <TemporalTagButton />
          </>
        }
      />
      <TemporalTagPopup />
    </TemporalTagProvider>
  );
};

export default TemporalTagTimeline;
