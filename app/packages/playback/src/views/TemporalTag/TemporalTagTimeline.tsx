import React, { useMemo } from "react";
import { TIMELINE_LABEL_WIDTH } from "../../lib/constants";
import { useTracks } from "../../lib/tracks/TrackProvider";
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

export interface TemporalTagTimelineProps extends TimelineWithTracksProps {
  onTagCreate?: (tag: TemporalTagCreatePayload) => Promise<void>;
  /** When provided, adds an "Edit tag" context-menu action that opens the
   *  popup pre-filled to mutate that tag's time range / label. */
  onTagUpdate?: (tag: TemporalTagUpdatePayload) => Promise<void>;
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
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  rulerOverlay,
  extraActions,
  eventMenuItems,
  ...timelineProps
}) => {
  const tracks = useTracks();
  const { state, actions } = useTemporalTagMode();

  // Mirror TimelineWithTracks's own labelWidth logic so the overlay aligns.
  const labelWidth = tracks.length === 0 ? 0 : requestedLabelWidth;

  const existingTags = useMemo(
    () =>
      tracks
        .filter((t) => t.id.startsWith("temporal-tag::"))
        .map((t) => t.label),
    [tracks],
  );
  const tagContextValue = {
    state,
    actions,
    onTagCreate,
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
        // readout) through the same slots.
        rulerOverlay={
          <>
            {rulerOverlay}
            <TemporalTagRangeOverlay labelWidth={labelWidth} />
          </>
        }
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
