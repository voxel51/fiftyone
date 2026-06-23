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
import TimelineTrack, { type NormalizedEvent } from "../TimelineTrack/TimelineTrack";
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
  /** Fired when the user chooses "Delete" from an event's context menu. */
  onEventDelete?: (event: NormalizedEvent) => void;
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
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
  rulerOverlay,
  extraActions,
  onEventDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seek } = usePlayback();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      onEventDelete={onEventDelete}
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
            extraActions={extraActions}
          >
            <div className={styles.pinnedOverlayHost}>
              {pinned.map(renderPinnedTrack)}
              <LoopOverlays labelWidth={labelWidth} />
              <PlayheadLine labelWidth={labelWidth} />
            </div>
          </TimelineHeader>
        )}
      >
        <div className={styles.tracksOuter}>
          <div className={styles.tracksArea}>
            <div>
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
          </div>
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
