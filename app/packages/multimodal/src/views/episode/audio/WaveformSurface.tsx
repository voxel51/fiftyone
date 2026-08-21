import {
  usePlayback,
  usePlayhead,
  useViewEnd,
  useViewStart,
} from "@fiftyone/playback";
import React, { useCallback, useRef, useState } from "react";
import WaveformViewer, { type WaveformTrackSpec } from "./WaveformViewer";
import styles from "./WaveformSurface.module.css";

export interface WaveformSurfaceProps {
  readonly tracks: readonly WaveformTrackSpec[];
  readonly className?: string;
}

/**
 * The waveform canvas plus its interactive overlay: a full-height playhead
 * line, a hover indicator, and click/drag-to-scrub.
 *
 * The lines live in DOM rather than in the WebGPU pass so they can sit
 * above the canvas and update at pointer/playhead cadence without
 * re-encoding a GPU frame. Time->x uses the same
 * `(t - viewStart) / (viewEnd - viewStart)` mapping `TimelineTrack` uses,
 * so it stays aligned with the ruler above it.
 */
const WaveformSurface: React.FC<WaveformSurfaceProps> = ({
  tracks,
  className,
}) => {
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const playhead = usePlayhead();
  const { seek } = usePlayback();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const span = viewEnd - viewStart;
  const pct = (timeSec: number): number | null => {
    if (!(span > 0)) return null;
    return ((timeSec - viewStart) / span) * 100;
  };

  const timeFromClientX = useCallback(
    (clientX: number): number | null => {
      const element = surfaceRef.current;
      if (!element || !(span > 0)) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return null;
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return viewStart + ratio * span;
    },
    [span, viewStart],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = timeFromClientX(event.clientX);
      if (target === null) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      seek(target);
    },
    [seek, timeFromClientX],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = timeFromClientX(event.clientX);
      setHoverSec(target);
      // Buttons bitmask: primary button still held → treat as a scrub drag.
      if (target !== null && event.buttons & 1) {
        seek(target);
      }
    },
    [seek, timeFromClientX],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!(span > 0)) return;
      // One step is 1/50th of the visible window, so the gesture stays
      // proportional at any zoom level.
      const step = span / 50;
      const delta =
        event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : event.key === "Home"
              ? viewStart - playhead
              : event.key === "End"
                ? viewEnd - playhead
                : 0;
      if (delta === 0) return;
      event.preventDefault();
      seek(Math.min(viewEnd, Math.max(viewStart, playhead + delta)));
    },
    [playhead, seek, span, viewEnd, viewStart],
  );

  const playheadPct = pct(playhead);
  const hoverPct = hoverSec === null ? null : pct(hoverSec);

  return (
    <div
      ref={surfaceRef}
      className={`${styles.surface} ${className ?? ""}`}
      data-testid="waveform-surface"
      // Seeking is otherwise pointer-only, which leaves keyboard users no
      // way to move the playhead from the waveform.
      role="slider"
      tabIndex={0}
      aria-label="Seek within the waveform"
      aria-valuemin={viewStart}
      aria-valuemax={viewEnd}
      aria-valuenow={playhead}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverSec(null)}
    >
      <WaveformViewer className={styles.canvas} tracks={tracks} />
      {hoverPct !== null && hoverPct >= 0 && hoverPct <= 100 ? (
        <div
          className={styles.hoverLine}
          data-testid="waveform-hover-line"
          style={{ left: `${hoverPct}%` }}
        />
      ) : null}
      {playheadPct !== null && playheadPct >= 0 && playheadPct <= 100 ? (
        <div
          className={styles.playheadLine}
          data-testid="waveform-playhead-line"
          style={{ left: `${playheadPct}%` }}
        />
      ) : null}
    </div>
  );
};

export default WaveformSurface;
