import { Drawer, useElementSize } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo, useRef, useState } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DEFAULT_DRAWER_SIZE,
  TIMELINE_DRAWER_HANDLE_SIZE,
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
   * Hard ceiling on drawer height (px).
   * @default TIMELINE_DRAWER_MAX_SIZE
   */
  maxSize?: number;
  className?: string;
  rulerOverlay?: React.ReactNode;
  extraActions?: React.ReactNode;
  onEventDelete?: (event: NormalizedEvent) => void;
}

/**
 * Full timeline composition.
 *
 * Pinned tracks live permanently in the Drawer header — always visible.
 * Unpinned tracks live permanently in the Drawer body — visible when open.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seek } = usePlayback();
  const [drawerOpen, setDrawerOpen] = useState(true);

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

  const { ref: pinnedSectionRef } = useElementSize();
  const { ref: headerMeasureRef, height: bareHeaderHeight } = useElementSize();
  const { ref: pinnedShadowRef, height: pinnedShadowHeight } = useElementSize();
  const { ref: unpinnedShadowRef, height: unpinnedShadowHeight } = useElementSize();

  const totalOpenHeight =
    TIMELINE_DRAWER_HANDLE_SIZE +
    bareHeaderHeight +
    pinnedShadowHeight +
    unpinnedShadowHeight;

  const effectiveDefaultSize = totalOpenHeight > 0
    ? Math.min(totalOpenHeight, maxSize)
    : TIMELINE_DEFAULT_DRAWER_SIZE;
  const effectiveMaxSize = totalOpenHeight > 0
    ? Math.min(totalOpenHeight, maxSize)
    : maxSize;

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
        <TimelineHeader labelWidth={labelWidth} zoomRef={containerRef} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={clsx(styles.root, className)}>
      <div className={styles.tracksShadow} aria-hidden>
        <div ref={pinnedShadowRef}>{pinned.map(renderShadowTrack)}</div>
        <div ref={unpinnedShadowRef}>{unpinned.map(renderShadowTrack)}</div>
      </div>

      <Drawer
        side="bottom"
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        defaultSize={effectiveDefaultSize}
        minSize={minDrawerSize}
        maxSize={effectiveMaxSize}
        mode="push"
        header={({ toggle }) => (
          <>
            <div ref={headerMeasureRef}>
              <TimelineHeader
                labelWidth={labelWidth}
                zoomRef={containerRef}
                onToggle={toggle}
                rulerOverlay={rulerOverlay}
                extraActions={extraActions}
              />
            </div>
            {pinned.length > 0 && (
              <div ref={pinnedSectionRef} className={styles.pinnedOverlayHost}>
                {pinned.map(renderPinnedTrack)}
                <LoopOverlays labelWidth={labelWidth} />
                <PlayheadLine labelWidth={labelWidth} />
              </div>
            )}
          </>
        )}
      >
        {unpinned.length > 0 && (
          <div className={styles.tracksOuter}>
            <div className={styles.tracksArea}>
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
                  onEventDelete={onEventDelete}
                  className={styles.unpinnedTrack}
                />
              ))}
            </div>
            <LoopOverlays labelWidth={labelWidth} />
            <PlayheadLine labelWidth={labelWidth} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
