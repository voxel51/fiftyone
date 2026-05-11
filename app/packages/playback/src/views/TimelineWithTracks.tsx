import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import React, { useRef } from "react";
import {
  playheadAtom,
  viewEndAtom,
  viewStartAtom,
} from "../lib/playback-atoms";
import TimelineControls from "./TimelineControls";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack, { TimelineTrackProps } from "./TimelineTrack";
import styles from "./TimelineWithTracks.module.css";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type TimelineTrackConfig = Pick<
  TimelineTrackProps,
  "id" | "color" | "bg" | "start" | "end" | "events" | "height"
>;

export interface TimelineWithTracksProps {
  tracks: TimelineTrackConfig[];
  /** Width of the label column shared between ruler and tracks. */
  labelWidth?: number;
  /** Height of the ruler row. */
  rulerHeight?: number;
  /**
   * Default open size of the drawer in pixels. The drawer collapses to its
   * measured header height (controls + ruler) when closed.
   * @default 220
   */
  defaultSize?: number;
  /** @default 120 */
  minSize?: number;
  /** @default 600 */
  maxSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Full timeline composition: controls + ruler in the always-visible header,
 * tracks in the resizable body. Wrapped in the design-system Drawer so the
 * user can collapse the tracks area or resize it. Owns the vertical playhead
 * line so it extends through every visible track.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  tracks,
  labelWidth = 120,
  rulerHeight = 24,
  defaultSize = 220,
  minSize = 120,
  maxSize = 600,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playhead = useAtomValue(playheadAtom);
  const viewStart = useAtomValue(viewStartAtom);
  const viewEnd = useAtomValue(viewEndAtom);

  const viewDuration = viewEnd - viewStart;
  const playheadRatio =
    viewDuration > 0 ? clamp((playhead - viewStart) / viewDuration, 0, 1) : 0;
  const playheadLeft = `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${playheadRatio})`;

  return (
    <div ref={containerRef} className={clsx(styles.root, className)} style={style}>
      <Drawer
        side="bottom"
        defaultSize={defaultSize}
        minSize={minSize}
        maxSize={maxSize}
        mode="push"
        header={() => (
          <div className={styles.header}>
            <div className={styles.controlsRow}>
              <TimelineControls />
            </div>
            <TimelineRuler
              labelWidth={labelWidth}
              height={rulerHeight}
              zoomRef={containerRef}
            />
          </div>
        )}
      >
        <div className={styles.tracksBody}>
          {tracks.map((track) => (
            <TimelineTrack
              key={track.id}
              {...track}
              labelWidth={labelWidth}
            />
          ))}
        </div>

        {/* Full-height playhead line — spans the entire drawer body so the
            line continues through every track. */}
        <div className={styles.playheadLine} style={{ left: playheadLeft }} />
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
