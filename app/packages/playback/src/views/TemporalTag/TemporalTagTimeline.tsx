import React, { useMemo } from "react";
import { TIMELINE_LABEL_WIDTH } from "../../lib/constants";
import { useTracks } from "../../lib/tracks/TrackProvider";
import { TemporalTagProvider } from "./TemporalTagContext";
import type { TemporalTagCreatePayload } from "./TemporalTagContext";
import TemporalTagButton from "./TemporalTagButton";
import TemporalTagPopup from "./TemporalTagPopup";
import TemporalTagRangeOverlay from "./TemporalTagRangeOverlay";
import { useTemporalTagMode } from "./use-temporal-tag-mode";
import TimelineWithTracks from "../TimelineWithTracks/TimelineWithTracks";
import type { TimelineWithTracksProps } from "../TimelineWithTracks/TimelineWithTracks";

export interface TemporalTagTimelineProps extends TimelineWithTracksProps {
  onTagCreate?: (tag: TemporalTagCreatePayload) => Promise<void>;
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
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
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
    [tracks]
  );
  const tagContextValue = { state, actions, onTagCreate, existingTags };

  return (
    <TemporalTagProvider value={tagContextValue}>
      <TimelineWithTracks
        {...timelineProps}
        labelWidth={requestedLabelWidth}
        rulerOverlay={<TemporalTagRangeOverlay labelWidth={labelWidth} />}
        extraActions={<TemporalTagButton />}
      />
      <TemporalTagPopup />
    </TemporalTagProvider>
  );
};

export default TemporalTagTimeline;
