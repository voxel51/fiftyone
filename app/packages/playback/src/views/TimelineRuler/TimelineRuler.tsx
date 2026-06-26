import { useDragDelta } from "@voxel51/voodo";
import clsx from "clsx";
import React, { type ReactNode, useEffect, useRef } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  useLoopEnd,
  useLoopStart,
  usePlayhead,
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import { clamp } from "../../lib/playback/utils";
import styles from "./TimelineRuler.module.css";

const MIN_VIEW = 0.25;
const CLICK_PX_THRESHOLD = 3;

function tickLabel(t: number): string {
  const s = Math.floor(t);
  const frac = Math.round((t - s) * 10) / 10;
  return frac === 0 ? `${s}s` : `${(s + frac).toFixed(1)}s`;
}

export interface TimelineRulerProps {
  /** Width of the label column in pixels, to align with track rows. */
  labelWidth?: number;
  /**
   * Optional ref to an outer container. When provided, wheel-to-zoom is
   * attached there so users can zoom from anywhere in the track area.
   */
  zoomRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  /** Optional overlay rendered inside the ruler's positioned context. */
  overlay?: ReactNode;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  labelWidth = 0,
  zoomRef,
  className,
  overlay,
}) => {
  const playhead = usePlayhead();
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const loopStart = useLoopStart();
  const loopEnd = useLoopEnd();
  const { duration, seek, setView, setLoop, snapPlayheadToFrame } =
    usePlayback();

  const rulerRef = useRef<HTMLDivElement>(null);

  // Capture state at drag-start so onDelta can compute against it without
  // racing with state updates during the drag.
  const dragRef = useRef({
    startValue: 0,
    startVs: 0,
    startVe: 0,
    laneWidth: 1,
    maxAbsDelta: 0,
    lastPointerX: 0,
  });

  const measureAtStart = () => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current.startVs = viewStart;
    dragRef.current.startVe = viewEnd;
    dragRef.current.laneWidth = Math.max(rect.width - labelWidth, 1);
    dragRef.current.maxAbsDelta = 0;
  };

  // Each draggable handle gets its own useDragDelta. The lane handles both
  // pan-drag and click-to-seek (distinguished by total movement at drag end).
  const playheadDrag = useDragDelta({
    axis: "horizontal",
    onDragStart: () => {
      measureAtStart();
      dragRef.current.startValue = playhead;
    },
    onDelta: (delta) => {
      const { startValue, startVs, startVe, laneWidth } = dragRef.current;
      const vd = startVe - startVs;
      dragRef.current.maxAbsDelta = Math.max(
        dragRef.current.maxAbsDelta,
        Math.abs(delta),
      );
      seek(clamp(startValue + (delta / laneWidth) * vd, 0, duration));
    },
    // Continuous while dragging (above); snap to a frame boundary only once
    // the drag settles. No-op unless the provider opted into snapping.
    onDragEnd: () => snapPlayheadToFrame(),
  });

  const loopStartDrag = useDragDelta({
    axis: "horizontal",
    onDragStart: () => {
      measureAtStart();
      dragRef.current.startValue = loopStart;
    },
    onDelta: (delta) => {
      const { startValue, startVs, startVe, laneWidth } = dragRef.current;
      const vd = startVe - startVs;
      const t = clamp(
        startValue + (delta / laneWidth) * vd,
        0,
        loopEnd - 1 / 60,
      );
      setLoop(t, loopEnd);
    },
  });

  const loopEndDrag = useDragDelta({
    axis: "horizontal",
    onDragStart: () => {
      measureAtStart();
      dragRef.current.startValue = loopEnd;
    },
    onDelta: (delta) => {
      const { startValue, startVs, startVe, laneWidth } = dragRef.current;
      const vd = startVe - startVs;
      const t = clamp(
        startValue + (delta / laneWidth) * vd,
        loopStart + 1 / 60,
        duration,
      );
      setLoop(loopStart, t);
    },
  });

  // Lane drag: pans the view. A pointer-up with very small total movement
  // counts as a click-to-seek instead.
  const laneDrag = useDragDelta({
    axis: "horizontal",
    onDragStart: () => {
      measureAtStart();
    },
    onDelta: (delta) => {
      const { startVs, startVe, laneWidth } = dragRef.current;
      dragRef.current.maxAbsDelta = Math.max(
        dragRef.current.maxAbsDelta,
        Math.abs(delta),
      );
      const vd = startVe - startVs;
      const dt = (delta / laneWidth) * vd;
      const newStart = clamp(startVs - dt, 0, duration - vd);
      setView(newStart, newStart + vd);
    },
    onDragEnd: () => {
      if (dragRef.current.maxAbsDelta >= CLICK_PX_THRESHOLD) return;
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const laneX = dragRef.current.lastPointerX - rect.left - labelWidth;
      const laneWidth = rect.width - labelWidth;
      // Guard against zero/negative lane width — the ratio math below
      // would produce NaN/Infinity and feed garbage into seek().
      if (laneWidth <= 0) return;
      if (laneX < 0 || laneX > laneWidth) return;
      const vs = dragRef.current.startVs;
      const ve = dragRef.current.startVe;
      seek(clamp(vs + (laneX / laneWidth) * (ve - vs), 0, duration));
      // Land a click-to-seek on a frame boundary too (no-op unless snapping
      // is enabled); reads the playhead `seek` just set.
      snapPlayheadToFrame();
    },
  });

  // Refs for stale-closure-free access inside the native wheel handler.
  const viewRef = useRef({ viewStart, viewEnd });
  useEffect(() => {
    viewRef.current = { viewStart, viewEnd };
  }, [viewStart, viewEnd]);

  // `setView` is a Jotai setter — referentially stable across renders —
  // so the ref's initial value is also its final value; no syncing effect
  // needed.
  const setViewRef = useRef(setView);
  setViewRef.current = setView;

  // Wheel-to-zoom attached to zoomRef (outer container) or the ruler itself.
  useEffect(() => {
    const target = zoomRef?.current ?? rulerRef.current;
    if (!target) return undefined;
    const rulerEl = rulerRef.current;

    const handleWheel = (e: WheelEvent) => {
      const { viewStart: vs, viewEnd: ve } = viewRef.current;
      const rect = (rulerEl ?? target).getBoundingClientRect();
      const laneWidth = rect.width - labelWidth;
      // Guard against zero/negative lane width — see drag handler above.
      if (laneWidth <= 0) return;

      if (e.ctrlKey) {
        e.preventDefault();
        const ratio = clamp(
          (e.clientX - rect.left - labelWidth) / laneWidth,
          0,
          1,
        );
        const pivotTime = vs + ratio * (ve - vs);
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const newDuration = clamp((ve - vs) * factor, MIN_VIEW, duration);
        const newStart = clamp(
          pivotTime - ratio * newDuration,
          0,
          duration - newDuration,
        );
        setViewRef.current(newStart, newStart + newDuration);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const vd = ve - vs;
        const dt = (e.deltaX / laneWidth) * vd;
        const newStart = clamp(vs + dt, 0, duration - vd);
        setViewRef.current(newStart, newStart + vd);
      }
    };

    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [zoomRef, duration, labelWidth]);

  const viewDuration = viewEnd - viewStart;
  const playheadRatio = clamp((playhead - viewStart) / viewDuration, 0, 1);
  const loopStartRatio = clamp((loopStart - viewStart) / viewDuration, 0, 1);
  const loopEndRatio = clamp((loopEnd - viewStart) / viewDuration, 0, 1);

  const tickInterval = viewDuration <= 1 ? 0.1 : viewDuration <= 3 ? 0.5 : 1;
  const ticks: number[] = [];
  const firstTick = Math.ceil(viewStart / tickInterval - 1e-9) * tickInterval;
  for (
    let t = Math.round(firstTick * 1e4) / 1e4;
    t <= viewEnd + 1e-9;
    t = Math.round((t + tickInterval) * 1e4) / 1e4
  ) {
    ticks.push(t);
  }

  const laneLeft = (ratio: number) =>
    `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${ratio})`;

  // Wrap lane pointer handlers so we can also track the last pointer position
  // for the click-to-seek path in laneDrag.onDragEnd.
  const lanePointerProps = {
    ...laneDrag.handleProps,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      dragRef.current.lastPointerX = e.clientX;
      laneDrag.handleProps.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      dragRef.current.lastPointerX = e.clientX;
      laneDrag.handleProps.onPointerMove(e);
    },
  };

  const cursor = playheadDrag.isDragging
    ? "grabbing"
    : loopStartDrag.isDragging || loopEndDrag.isDragging
      ? "ew-resize"
      : undefined;

  return (
    <div
      ref={rulerRef}
      className={clsx(styles.ruler, className)}
      data-testid="timeline-ruler"
      style={{ cursor }}
      {...lanePointerProps}
    >
      {labelWidth > 0 && (
        <div
          className={styles.labelSpacer}
          data-testid="timeline-ruler-label-spacer"
          style={{ width: labelWidth }}
        />
      )}

      <div className={styles.lane}>
        {ticks.map((t) => (
          <span
            key={t}
            className={styles.tick}
            style={{
              left: `${((t - viewStart) / viewDuration) * 100}%`,
            }}
          >
            {tickLabel(t)}
          </span>
        ))}
      </div>

      <div
        className={styles.loopHandle}
        style={{ left: laneLeft(loopStartRatio) }}
        {...loopStartDrag.handleProps}
        onPointerDown={(e) => {
          // Stop the lane drag from also receiving this event; the lane's
          // useDragDelta would otherwise steal pointer capture.
          e.stopPropagation();
          loopStartDrag.handleProps.onPointerDown(e);
        }}
        onPointerUp={(e) => {
          // pointerup bubbles — without stopPropagation the lane's onDragEnd
          // fires with maxAbsDelta=0 and triggers an unintended seek.
          e.stopPropagation();
          loopStartDrag.handleProps.onPointerUp();
        }}
      />
      <div
        className={styles.loopHandle}
        style={{ left: laneLeft(loopEndRatio) }}
        {...loopEndDrag.handleProps}
        onPointerDown={(e) => {
          e.stopPropagation();
          loopEndDrag.handleProps.onPointerDown(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          loopEndDrag.handleProps.onPointerUp();
        }}
      />

      {/* Playhead handle + line share one translated wrapper. translate3d
          on the wrapper is composited (no layout on every tick); the
          handle and line stay anchored to the wrapper's left edge. */}
      <div
        className={styles.playheadGroup}
        style={{
          left: labelWidth,
          width: `calc(100% - ${labelWidth}px)`,
          transform: `translate3d(${playheadRatio * 100}%, 0, 0)`,
        }}
      >
        <div className={styles.playheadLine} />
        <div
          className={styles.playheadHandle}
          {...playheadDrag.handleProps}
          onPointerDown={(e) => {
            e.stopPropagation();
            playheadDrag.handleProps.onPointerDown(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            playheadDrag.handleProps.onPointerUp();
          }}
        >
          <div className={styles.playheadTriangle} />
        </div>
      </div>

      {overlay}
    </div>
  );
};

export default TimelineRuler;
