import React from "react";
import {
  useBufferedRanges,
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import { clamp } from "../../lib/playback/utils";
import styles from "./TimelineHeader.module.css";

export interface BufferedRangesStripProps {
  /** Width of the label column shared between ruler and tracks. */
  labelWidth: number;
}

/**
 * Thin shading along the timeline's top edge marking the window ranges
 * that are buffered and ready to play (the data layer publishes them via
 * `setBufferedRanges`). Same time→x mapping as the ruler and playhead:
 * the lane starts after the label column and spans the current view
 * window.
 */
const BufferedRangesStrip: React.FC<BufferedRangesStripProps> = ({
  labelWidth,
}) => {
  const ranges = useBufferedRanges();
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const viewDuration = viewEnd - viewStart;

  if (viewDuration <= 0 || ranges.length === 0) return null;

  return (
    <div
      className={styles.bufferStrip}
      style={{ left: labelWidth, width: `calc(100% - ${labelWidth}px)` }}
      data-testid="buffered-ranges-strip"
      aria-hidden
    >
      {ranges.map(([startSec, endSec], i) => {
        const left = clamp((startSec - viewStart) / viewDuration, 0, 1);
        const right = clamp((endSec - viewStart) / viewDuration, 0, 1);
        if (right <= left) return null;
        return (
          <span
            // Ranges are ascending and non-overlapping; index is stable
            // enough for a presentational list that fully re-renders.
            key={i}
            className={styles.bufferSegment}
            style={{
              left: `${left * 100}%`,
              width: `${(right - left) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
};

export default BufferedRangesStrip;
