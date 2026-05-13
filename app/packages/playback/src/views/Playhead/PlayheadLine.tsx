import React from "react";
import {
  usePlayhead,
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import styles from "./PlayheadLine.module.css";
import { clamp } from "../utils/timeline-utils";

export interface PlayheadLineProps {
  /** Width of the label column shared between ruler and tracks. */
  labelWidth: number;
}

/**
 * Full-height vertical playhead line. Isolated so the playheadAtom
 * subscription doesn't re-render the rest of the timeline on every RAF tick.
 *
 * Uses a nested outer/inner trick to position via `transform: translateX(%)`
 * instead of `left`, which avoids layout work on every tick. The outer
 * spans the lane area (label column → right edge), so `translateX(50%)`
 * moves the inner by 50% of the lane width.
 *
 * Must be rendered inside a positioned ancestor (any non-static `position`)
 * that spans the region the line should cover.
 */
const PlayheadLine: React.FC<PlayheadLineProps> = ({ labelWidth }) => {
  const playhead = usePlayhead();
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const viewDuration = viewEnd - viewStart;
  const ratio =
    viewDuration > 0 ? clamp((playhead - viewStart) / viewDuration, 0, 1) : 0;
  return (
    <div
      className={styles.outer}
      style={{
        left: labelWidth,
        width: `calc(100% - ${labelWidth}px)`,
        transform: `translate3d(${ratio * 100}%, 0, 0)`,
      }}
    >
      <div className={styles.line} />
    </div>
  );
};

export default PlayheadLine;
