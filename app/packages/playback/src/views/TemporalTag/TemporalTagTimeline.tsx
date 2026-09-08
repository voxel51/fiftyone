import React, { useMemo } from "react";
import { TIMELINE_LABEL_WIDTH } from "../../lib/constants";
import { useTracks, useTrackPinning } from "../../lib/tracks/TrackProvider";
import { TemporalTagProvider } from "./TemporalTagContext";
import type {
  TemporalTagCreatePayload,
  TemporalTagUpdatePayload,
} from "./TemporalTagContext";
import TemporalTagButton from "./TemporalTagButton";
import TemporalTagPopup from "./TemporalTagPopup";
import TemporalTagRangeOverlay from "./TemporalTagRangeOverlay";
import { useTemporalTagMode } from "./use-temporal-tag-mode";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";
import type { TimelineWithTracksProps } from "../TimelineWithTracks/TimelineWithTracks";
import type { TrackEventMenuItem } from "../TimelineTrack/TimelineTrack";

/** Track-id prefix for a temporal-tag group; the host builds the same ids. */
const TEMPORAL_TAG_TRACK_PREFIX = "temporal-tag::";

export interface TemporalTagTimelineProps extends TimelineWithTracksProps {
  onTagCreate?: (tag: TemporalTagCreatePayload) => Promise<void>;
  /** When provided, adds an "Edit tag" context-menu action that opens the
   *  popup pre-filled to mutate that tag's time range / label. */
  onTagUpdate?: (tag: TemporalTagUpdatePayload) => Promise<void>;
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
  eventMenuItems,
  ...timelineProps
}) => {
  const tracks = useTracks();
  const { setPinned } = useTrackPinning();
  const { state, actions } = useTemporalTagMode();

  const existingTags = useMemo(() => {
    const onTimeline = tracks
      .filter((t) => t.id.startsWith(TEMPORAL_TAG_TRACK_PREFIX))
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
      setPinned(`${TEMPORAL_TAG_TRACK_PREFIX}${tag.tag}`, true);
    };
  }, [onTagCreate, setPinned]);

  const tagContextValue = {
    state,
    actions,
    onTagCreate: handleTagCreate,
    onTagUpdate,
    existingTags,
  };

  // Prepend an "Edit tag" action (opens the popup pre-filled) to the
  // caller-provided menu items when editing is wired in.
  const mergedEventMenuItems = useMemo<TrackEventMenuItem[] | undefined>(() => {
    if (!onTagUpdate) return eventMenuItems;
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
    return [editItem, ...(eventMenuItems ?? [])];
  }, [onTagUpdate, eventMenuItems, actions]);

  return (
    <TemporalTagProvider value={tagContextValue}>
      <TimelineWithTracks
        {...timelineProps}
        eventMenuItems={mergedEventMenuItems}
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
