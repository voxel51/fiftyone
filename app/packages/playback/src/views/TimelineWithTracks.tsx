import { Card } from "@voxel51/voodo";
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
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Full timeline composition: controls on top, ruler in the middle, tracks
 * below. Owns the vertical playhead line so it extends through the tracks
 * (the ruler only renders the triangle handle).
 *
 * Wrapped in a voodo `Card` for now — should move to the design-system
 * `Drawer` component once it ships in `@voxel51/voodo`.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  tracks,
  labelWidth = 120,
  rulerHeight = 24,
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
  // Position uses the same `labelWidth + ratio * laneWidth` math as the ruler.
  const playheadLeft = `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${playheadRatio})`;

  return (
    <Card compact outlined className={clsx(styles.root, className)} style={style}>
      <div className={styles.controlsRow}>
        <TimelineControls />
      </div>

      <div ref={containerRef} className={styles.tracksArea}>
        <TimelineRuler
          labelWidth={labelWidth}
          height={rulerHeight}
          zoomRef={containerRef}
        />
        {tracks.map((track) => (
          <TimelineTrack
            key={track.id}
            {...track}
            labelWidth={labelWidth}
          />
        ))}

        {/* Full-height playhead line — spans ruler + every track. */}
        <div className={styles.playheadLine} style={{ left: playheadLeft }} />
      </div>
    </Card>
  );
};

export default TimelineWithTracks;
