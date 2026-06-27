import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * When true, the drawer auto-expands on the empty→non-empty `tracks`
   * transition (i.e. the first track to land). Explicit user toggles set
   * a sticky override so subsequent track additions don't re-expand a
   * collapse the user just performed. Opt-in for surfaces that author
   * tracks interactively (e.g. video annotation).
   * @default false
   */
  autoExpandOnFirstTrack?: boolean;
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
  autoExpandOnFirstTrack = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seek } = usePlayback();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Sticky: once the user explicitly toggles the drawer, auto-expand stops
  // overriding their choice for the remainder of this mount.
  const userOverrodeRef = useRef(false);
  const prevHadTracksRef = useRef(tracks.length > 0);

  useEffect(() => {
    if (!autoExpandOnFirstTrack) return;
    const hasTracks = tracks.length > 0;
    if (hasTracks && !prevHadTracksRef.current && !userOverrodeRef.current) {
      setDrawerOpen(true);
    }
    prevHadTracksRef.current = hasTracks;
  }, [tracks.length, autoExpandOnFirstTrack]);

  const onDrawerToggle = (next: boolean) => {
    userOverrodeRef.current = true;
    setDrawerOpen(next);
  };

  const labelWidth = tracks.length === 0 ? 0 : requestedLabelWidth;

  const { pinned, unpinned } = useMemo(() => {
    const p: Track[] = [];
    const u: Track[] = [];
    for (const t of tracks) {
      if (pinnedIds.has(t.id)) p.push(t);
      else u.push(t);
    }
    return { pinned: p, unpinned: u };
  }, [tracks, pinnedIds]);

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
      onEventClick={(e) => seek(e.startSec)}
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
        onOpenChange={onDrawerToggle}
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
                  track id, so selecting one hit both.

                  Unpinned rows are also rendered here when the drawer is
                  closed (de-emphasized via .unpinnedTrack) so that toggling
                  pin off doesn't hide a track entirely — pin acts as
                  "sticky to top" rather than visibility gating. */}
              {!drawerOpen && pinned.map(renderPinnedTrack)}
              {!drawerOpen && unpinned.length > 0 && (
                <div className={styles.collapsedUnpinned}>
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
                        onEventClick={(e) => seek(e.startSec)}
                        eventMenuItems={eventMenuItems}
                        {...extra}
                        className={clsx(styles.unpinnedTrack, extra?.className)}
                      />
                    );
                  })}
                </div>
              )}
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
                    onEventClick={(e) => seek(e.startSec)}
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
