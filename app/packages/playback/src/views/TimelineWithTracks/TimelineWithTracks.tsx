import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo, useRef, useState } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DRAWER_MAX_SIZE,
  TIMELINE_LABEL_WIDTH,
} from "../../lib/constants";
import {
  useTrackPinning,
  useTracks,
  type Track,
} from "../../lib/tracks/TrackProvider";
import LoopOverlays from "../Loop/LoopOverlays";
import PlayheadLine from "../Playhead/PlayheadLine";
import TimelineHeader from "../TimelineHeader/TimelineHeader";
import TimelineTrack, {
  type TimelineTrackProps,
  type TrackEventMenuItem,
} from "../TimelineTrack/TimelineTrack";
import { partitionTracksByPin } from "./partitionTracksByPin";
import styles from "./TimelineWithTracks.module.css";

export interface TimelineWithTracksProps {
  /** @default TIMELINE_LABEL_WIDTH */
  labelWidth?: number;
  /**
   * Initial open size of the drawer (px). Capped by content height.
   * @default TIMELINE_DEFAULT_DRAWER_SIZE
   */
  defaultSize?: number;
  /**
   * Hard ceiling on drawer height (px).
   * @default TIMELINE_DRAWER_MAX_SIZE
   */
  maxSize?: number;
  className?: string;
  /** Overlay rendered on top of the ruler row in each TimelineHeader. */
  rulerOverlay?: React.ReactNode;
  /**
   * Custom context-menu items added to every track's events. Per-row overrides
   * can still be supplied via {@link decorateTrack}. See
   * {@link TimelineTrackProps.eventMenuItems}.
   */
  eventMenuItems?: TrackEventMenuItem[];
  /**
   * Optional content rendered inline between the playback control buttons and
   * the playhead time display. Forwarded to {@link TimelineHeader}'s
   * `extraControls`; renders in both the empty-timeline and drawer layouts.
   */
  extraControls?: React.ReactNode;
  /**
   * Optional content rendered far-right after the playhead time, preceded by a
   * divider. Forwarded to {@link TimelineHeader}'s `extraActions`; renders in
   * both the empty-timeline and drawer layouts.
   */
  extraActions?: React.ReactNode;
  /**
   * Per-row prop override. Returned partial is merged onto the props
   * passed to each {@link TimelineTrack}.
   */
  decorateTrack?: (
    track: Track,
    pinned: boolean,
  ) => Partial<TimelineTrackProps>;
}

/**
 * Full timeline composition.
 *
 * When the drawer is **closed**, pinned tracks render in the
 * TimelineHeader's below-ruler slot so they remain visible alongside
 * the controls and ruler. When the drawer is **open**, all tracks —
 * pinned at the top, unpinned below — live in the drawer body and
 * scroll together as one unit.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
  rulerOverlay,
  eventMenuItems,
  extraControls,
  extraActions,
  decorateTrack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seekSnapped } = usePlayback();
  // Drawer starts open: the annotation surface remounts on each entry to
  // annotate mode (sample change / mode toggle), so an initial-`true` covers
  // the "make the timeline visible immediately" case without a tracks-length
  // effect. User-initiated collapses persist until the next remount.
  const [drawerOpen, setDrawerOpen] = useState(true);

  const labelWidth = tracks.length === 0 ? 0 : requestedLabelWidth;

  // Sub-rows follow their parent's pin state via `parentId` so a partial pin
  // doesn't strand attribute children above unrelated parents — see
  // {@link partitionTracksByPin}.
  const { pinned, unpinned } = useMemo(
    () => partitionTracksByPin(tracks, pinnedIds),
    [tracks, pinnedIds],
  );

  const renderPinnedTrack = (track: Track) => (
    <TimelineTrack
      key={track.id}
      id={track.id}
      label={track.label}
      color={track.color}
      events={track.events}
      labelWidth={labelWidth}
      pinned
      onPinClick={() => togglePin(track.id)}
      onEventClick={(e) => seekSnapped(e.startSec)}
      eventMenuItems={eventMenuItems}
      {...(decorateTrack ? decorateTrack(track, true) : null)}
    />
  );

  if (tracks.length === 0) {
    return (
      <div
        ref={containerRef}
        className={clsx(styles.root, styles.noTracks, className)}
      >
        <TimelineHeader
          labelWidth={labelWidth}
          zoomRef={containerRef}
          rulerOverlay={rulerOverlay}
          extraControls={extraControls}
          extraActions={extraActions}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={clsx(styles.root, className)}>
      <Drawer
        side="bottom"
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        maxSize={maxSize}
        mode="push"
        header={({ toggle }) => (
          <TimelineHeader
            labelWidth={labelWidth}
            zoomRef={containerRef}
            onToggle={toggle}
            rulerOverlay={rulerOverlay}
            extraControls={extraControls}
            extraActions={extraActions}
          >
            <div className={styles.pinnedOverlayHost}>
              {/* Pinned rows live here only while the drawer is closed; when it
                  opens they move into the body below. Rendering both
                  unconditionally double-mounts every pinned row under the same
                  track id, so selecting one hit both. */}
              {!drawerOpen && pinned.map(renderPinnedTrack)}
              <LoopOverlays labelWidth={labelWidth} />
              <PlayheadLine labelWidth={labelWidth} />
            </div>
          </TimelineHeader>
        )}
      >
        <div className={styles.tracksOuter}>
          <div className={styles.tracksArea}>
            {/* When the drawer is open, pinned tracks move into the body
                so they scroll together with the unpinned section below; the
                header slot above stops rendering them so each row mounts once. */}
            <div className={styles.pinnedTracks}>
              {drawerOpen && pinned.map(renderPinnedTrack)}
            </div>
            <div>
              {unpinned.map((track) => {
                const extra = decorateTrack
                  ? decorateTrack(track, false)
                  : null;
                return (
                  <TimelineTrack
                    key={track.id}
                    id={track.id}
                    label={track.label}
                    color={track.color}
                    events={track.events}
                    labelWidth={labelWidth}
                    pinned={false}
                    onPinClick={() => togglePin(track.id)}
                    onEventClick={(e) => seekSnapped(e.startSec)}
                    eventMenuItems={eventMenuItems}
                    {...extra}
                    className={clsx(styles.unpinnedTrack, extra?.className)}
                  />
                );
              })}
            </div>
          </div>
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
