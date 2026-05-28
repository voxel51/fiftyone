import { Drawer, useElementSize } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo, useRef } from "react";
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
 * Pinned tracks live permanently in the Drawer header — they are always
 * visible and never move. Unpinned tracks live permanently in the Drawer
 * body — they appear when the drawer is open and collapse when it closes.
 *
 * This "no teleportation" design eliminates the DOM-move flicker that
 * occurred when tracks switched between the header slot and the body on
 * every open/close transition.
 *
 * Sizing is driven by ResizeObserver on two shadow sections:
 *   pinnedShadowHeight  — determines closedSize (header height the Drawer
 *                         will compute, matching our layout exactly)
 *   unpinnedShadowHeight — what the body needs to open to full content
 *
 * defaultSize = HANDLE + bareHeader + pinned + unpinned  (fit-to-content)
 * The Drawer's own closeThreshold (= header height + HANDLE) naturally
 * prevents collapsing below the pinned rows.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  defaultSize = TIMELINE_DEFAULT_DRAWER_SIZE,
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

  // Bare controls+ruler height — stable, never includes track rows.
  const { ref: headerMeasureRef, height: bareHeaderHeight } = useElementSize();

  // pinnedSectionRef anchors PlayheadLine/LoopOverlays over the pinned rows.
  const { ref: pinnedSectionRef } = useElementSize();

  // Shadows: always in DOM at natural height, invisible, non-interactive.
  // Measuring them separately lets us derive the exact open size and
  // match the Drawer's own closedSize calculation without guessing.
  const { ref: pinnedShadowRef, height: pinnedShadowHeight } = useElementSize();
  const { ref: unpinnedShadowRef, height: unpinnedShadowHeight } =
    useElementSize();

  // The Drawer computes closedSize = its_headerHeight + HANDLE internally.
  // its_headerHeight = bareHeaderHeight + pinnedShadowHeight (our header
  // render contains exactly those two things). So:
  //   closedSize  = HANDLE + bareHeader + pinned
  //   defaultSize = HANDLE + bareHeader + pinned + unpinned = closedSize + unpinned
  const hasMeasurements = bareHeaderHeight > 0;
  const totalOpenHeight =
    TIMELINE_DRAWER_HANDLE_SIZE +
    bareHeaderHeight +
    pinnedShadowHeight +
    unpinnedShadowHeight;
  const effectiveDefaultSize = hasMeasurements
    ? Math.min(totalOpenHeight, maxSize)
    : defaultSize;
  const effectiveMaxSize = hasMeasurements
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
      onEventDelete={onEventDelete}
    />
  );

  const renderShadowTrack = (track: Track) => (
    <TimelineTrack
      key={`shadow-${track.id}`}
      id={`shadow-${track.id}`}
      label={track.label}
      color={track.color}
      events={[]}
      labelWidth={labelWidth}
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
      {/* Shadow sections — always in DOM, invisible, out of layout flow. */}
      <div className={styles.tracksShadow} aria-hidden>
        <div ref={pinnedShadowRef}>{pinned.map(renderShadowTrack)}</div>
        <div ref={unpinnedShadowRef}>{unpinned.map(renderShadowTrack)}</div>
      </div>

      <Drawer
        side="bottom"
        defaultOpen={false}
        defaultSize={effectiveDefaultSize}
        minSize={0}
        maxSize={effectiveMaxSize}
        mode="push"
        header={({ toggle }) => (
          <>
            {/* Bare controls + ruler. Ref here gives us bareHeaderHeight,
                which is stable and never inflated by track rows. */}
            <div ref={headerMeasureRef}>
              <TimelineHeader
                labelWidth={labelWidth}
                zoomRef={containerRef}
                onToggle={toggle}
                rulerOverlay={rulerOverlay}
                extraActions={extraActions}
              />
            </div>
            {/* Pinned tracks are ALWAYS here — never move to the body.
                This eliminates the open/close flicker caused by DOM
                teleportation. The Drawer's internal closedSize naturally
                includes them, so they stay visible when collapsed. */}
            {pinned.length > 0 && (
              <div
                ref={pinnedSectionRef}
                className={styles.pinnedOverlayHost}
              >
                {pinned.map(renderPinnedTrack)}
                <LoopOverlays labelWidth={labelWidth} />
                <PlayheadLine labelWidth={labelWidth} />
              </div>
            )}
          </>
        )}
      >
        {/* Body contains ONLY unpinned tracks. They are shown when the
            drawer is open and collapse when closed — no teleportation. */}
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
