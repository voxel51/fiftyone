import { Drawer, useElementSize } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useRef } from "react";
import {
  TIMELINE_DEFAULT_DRAWER_SIZE,
  TIMELINE_DRAWER_MAX_SIZE,
  TIMELINE_LABEL_WIDTH,
} from "../lib/constants";
import LoopOverlays from "./LoopOverlays";
import PlayheadLine from "./PlayheadLine";
import TimelineHeader from "./TimelineHeader";
import TimelineTrack, { TimelineTrackProps } from "./TimelineTrack";
import styles from "./TimelineWithTracks.module.css";

export type TimelineTrackConfig = Pick<
  TimelineTrackProps,
  "id" | "color" | "bg" | "start" | "end" | "events" | "height"
>;

export interface TimelineWithTracksProps {
  tracks: TimelineTrackConfig[];
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
 * Full timeline composition: controls + ruler in the always-visible header,
 * tracks in the resizable body. Subscribes to no atoms directly — every
 * tick-y subscription lives in `<PlayheadLine>` and `<LoopOverlays>`, so
 * the buttons in the header stay stable across RAF ticks.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  tracks,
  labelWidth = TIMELINE_LABEL_WIDTH,
  defaultSize = TIMELINE_DEFAULT_DRAWER_SIZE,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure both the header (controls + ruler) and the tracks body so we
  // can clamp the drawer's draggable max to the actual visible content.
  // The Drawer's `size` is the TOTAL drawer height (header + body), so if
  // we only clamp by body height the header gets crammed in and content
  // gets clipped.
  const { ref: tracksBodyRef, height: contentHeight } = useElementSize();
  const { ref: headerMeasureRef, height: headerHeight } = useElementSize();

  // Before measurement we fall back to maxSize so the drawer can open to
  // a sensible size. Once measured, the smaller of (visible content,
  // maxSize) wins.
  const visibleContent = contentHeight + headerHeight;
  const effectiveMaxSize =
    contentHeight > 0 && headerHeight > 0
      ? Math.min(visibleContent, maxSize)
      : maxSize;
  const effectiveDefaultSize = Math.min(defaultSize, effectiveMaxSize);

  return (
    <div ref={containerRef} className={clsx(styles.root, className)}>
      <Drawer
        side="bottom"
        defaultSize={effectiveDefaultSize}
        minSize={0}
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
          <div ref={tracksBodyRef} className={styles.tracksBody}>
            {tracks.map((track) => (
              <TimelineTrack
                key={track.id}
                {...track}
                labelWidth={labelWidth}
              />
            ))}
          </div>

          {/* Both overlays are absolutely positioned and anchor to
              `.tracksArea` (the explicit positioning wrapper above).
              That keeps them contained to the tracks region — they can't
              leak up into the ruler / controls regardless of what the
              Drawer's CSS does with its body. */}
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
