import { Drawer, useElementSize } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo, useRef } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DEFAULT_DRAWER_SIZE,
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
   * Hard ceiling on drawer height (px). Effective max is also clamped to the
   * measured content height.
   * @default TIMELINE_DRAWER_MAX_SIZE
   */
  maxSize?: number;
  className?: string;
}

/**
 * Full timeline composition. All tracks live inside the drawer's body
 * with pinned tracks rendered at the top — so scrolling the body moves
 * pinned and unpinned content together. The drawer's `minSize` is
 * clamped to fit `header + pinned tracks`, which means the "closed"
 * state always keeps the pinned section visible alongside the
 * controls + ruler. Dragging the drawer open reveals the unpinned
 * tracks beneath.
 *
 * Pin button on any row toggles its pin state (the row moves between
 * the pinned and unpinned regions). Clicking an event on a track seeks
 * the playhead to that event's start.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  defaultSize = TIMELINE_DEFAULT_DRAWER_SIZE,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seek } = usePlayback();

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

  // Measure the header (controls + ruler) and the pinned-tracks region
  // separately. minSize = header + pinned tracks → "closed" still
  // shows the pinned section. Total content height (pinned + unpinned)
  // caps the open size so we don't have a giant empty drawer.
  const { ref: pinnedSectionRef, height: pinnedHeight } = useElementSize();
  const { ref: unpinnedSectionRef, height: unpinnedHeight } = useElementSize();
  const { ref: headerMeasureRef, height: headerHeight } = useElementSize();

  const minDrawerSize =
    headerHeight > 0 ? headerHeight + pinnedHeight : 0;
  const totalContent = headerHeight + pinnedHeight + unpinnedHeight;
  const effectiveMaxSize =
    headerHeight > 0
      ? Math.max(minDrawerSize, Math.min(totalContent, maxSize))
      : maxSize;
  const effectiveDefaultSize = Math.max(
    minDrawerSize,
    Math.min(defaultSize, effectiveMaxSize)
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
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={clsx(styles.root, className)}>
      <Drawer
        side="bottom"
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
            />
          </div>
        )}
      >
        <div className={styles.tracksArea}>
          {/* Pinned tracks render at the top of the body. The drawer's
              minSize is sized so this block is always visible — even
              when "closed". Open the drawer to scroll into the
              unpinned section below; both regions share the same
              scroll container so they move together. */}
          <div ref={pinnedSectionRef} className={styles.pinnedTracks}>
            {pinned.map((track) => (
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
            ))}
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

          {/* Both overlays are absolutely positioned and anchor to
              `.tracksArea` (the explicit positioning wrapper above).
              They cover BOTH the pinned and unpinned regions now that
              both live in the body. */}
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
