import React from "react";
import {
  useBufferedRanges,
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import { clamp } from "../../lib/playback/utils";
import styles from "./TimelineRuler.module.css";

/**
 * Buffered-ranges wash rendered behind the ruler's ticks — the
 * YouTube-style "loaded" bar, directly on the lane users scrub. The data
 * layer publishes ranges via `setBufferedRanges`; segments map through
 * the same view-window math as the ticks and playhead. Mounted inside
 * the ruler's tick lane, so the label-column offset, overflow clipping,
 * and pointer-events opt-out all come for free.
 */
const BufferedLaneShading: React.FC = () => {
  const ranges = useBufferedRanges();
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const viewDuration = viewEnd - viewStart;

  if (viewDuration <= 0 || ranges.length === 0) return null;

  return (
    <div
      className={styles.bufferedShading}
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
            className={styles.bufferedSegment}
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

export default BufferedLaneShading;
