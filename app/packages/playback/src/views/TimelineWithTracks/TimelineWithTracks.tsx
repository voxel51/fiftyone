import { Drawer, useElementSize } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo, useRef, useState } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DEFAULT_DRAWER_SIZE,
  TIMELINE_DRAWER_HANDLE_SIZE,
  TIMELINE_DRAWER_MAX_SIZE,
  TIMELINE_LABEL_WIDTH,
  TIMELINE_TRACK_HEIGHT,
} from "../../lib/constants";
import {
  useTrackPinning,
  useTracks,
  type Track,
} from "../../lib/tracks/TrackProvider";
import LoopOverlays from "../Loop/LoopOverlays";
import PlayheadLine from "../Playhead/PlayheadLine";
import TimelineHeader from "../TimelineHeader/TimelineHeader";
import TimelineTrack from "../TimelineTrack/TimelineTrack";
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
  /** Injected into the controls row of each TimelineHeader. */
  extraActions?: React.ReactNode;
}

/**
 * Full timeline composition.
 *
 * When the drawer is **closed**, pinned tracks render in the
 * TimelineHeader's below-ruler slot so they remain visible alongside
 * the controls and ruler. When the drawer is **open**, all tracks —
 * pinned at the top, unpinned below — live in the drawer body and
 * scroll together as one unit.
 *
 * The drawer's minimum drag size equals the pinned section height, so
 * the user can never drag below the pinned rows while the drawer is open.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  defaultSize = TIMELINE_DEFAULT_DRAWER_SIZE,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
  rulerOverlay,
  extraActions,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seek } = usePlayback();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // No tracks → no label column. The ruler/playhead/overlays span the
  // full width so the timeline doesn't look oddly off-center with a
  // wide empty column on the left.
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

  // pinnedSectionRef is attached to whichever DOM node currently holds the
  // pinned tracks so playhead/loop overlays can anchor to the visible rows.
  const { ref: pinnedSectionRef, height: pinnedHeight } = useElementSize();
  const { ref: unpinnedSectionRef, height: unpinnedHeight } = useElementSize();
  // headerMeasureRef measures the real chrome height (controls + ruler) so
  // the Drawer's total-height calculations stay accurate if the chrome ever
  // changes size (e.g. extra controls added).
  const { ref: headerMeasureRef, height: headerMeasuredHeight } =
    useElementSize();

  // Deterministic size: derived from track count × fixed row height so the
  // drawer opens at the right size the very first time — no async-measurement
  // race conditions. Falls back to the measured values once they arrive.
  const CHROME =
    headerMeasuredHeight > 0
      ? headerMeasuredHeight + TIMELINE_DRAWER_HANDLE_SIZE
      : 0;
  const trackBodyHeight =
    pinnedHeight + unpinnedHeight > 0
      ? pinnedHeight + unpinnedHeight
      : tracks.length * TIMELINE_TRACK_HEIGHT;
  const totalDrawerHeight = CHROME + trackBodyHeight;

  const minDrawerSize = 0;
  const effectiveMaxSize =
    totalDrawerHeight > 0 ? Math.min(totalDrawerHeight, maxSize) : maxSize;
  const effectiveDefaultSize =
    totalDrawerHeight > 0
      ? Math.min(defaultSize, effectiveMaxSize)
      : defaultSize;

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
    />
  );

  // No tracks at all → there's nothing for the drawer body to ever
  // hold, so skip the Drawer entirely and just render the controls +
  // ruler inline. Avoids an empty resize-handle / mystery-band layout
  // and dodges the Drawer's "defaultSize set on first render and never
  // shrinks" behaviour.
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
        defaultSize={effectiveDefaultSize}
        minSize={minDrawerSize}
        maxSize={effectiveMaxSize}
        mode="push"
        header={({ toggle }) => (
          <div ref={headerMeasureRef}>
            <TimelineHeader
              labelWidth={labelWidth}
              zoomRef={containerRef}
              onToggle={toggle}
              rulerOverlay={rulerOverlay}
              extraActions={extraActions}
            >
              {/* Pinned tracks live here when the drawer is closed so they
                stay on-screen. The host div is position:relative so the
                PlayheadLine and LoopOverlays anchor to it and cover the
                visible tracks. */}
              {!drawerOpen && pinned.length > 0 && (
                <div
                  ref={pinnedSectionRef}
                  className={styles.pinnedOverlayHost}
                >
                  {pinned.map(renderPinnedTrack)}
                  <LoopOverlays labelWidth={labelWidth} />
                  <PlayheadLine labelWidth={labelWidth} />
                </div>
              )}
            </TimelineHeader>
          </div>
        )}
      >
        <div className={styles.tracksOuter}>
          <div className={styles.tracksArea}>
            {/* When the drawer is open, pinned tracks move into the body
              so they scroll together with the unpinned section below. */}
            <div
              ref={drawerOpen ? pinnedSectionRef : undefined}
              className={styles.pinnedTracks}
            >
              {pinned.map(renderPinnedTrack)}
            </div>
            <div ref={unpinnedSectionRef}>
              {unpinned.map((track) => (
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
                  className={styles.unpinnedTrack}
                />
              ))}
            </div>
          </div>

          {/* Overlays sit on the non-scrolling outer wrapper so they
            anchor to the visible height and don't scroll with the
            tracks. */}
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
