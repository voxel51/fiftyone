import { useDragDelta } from "@voxel51/voodo";
import clsx from "clsx";
import React, { type ReactNode, useEffect, useRef } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import { setHoverTime } from "../../lib/playback/store-access";
import type { TimelineDisplayConversion } from "../../lib/playback/timeline-display";
import { useTimelineDisplay } from "../../lib/playback/timeline-display";
import type { TimelineMode } from "../../lib/playback/types";
import {
  useHoverTime,
  useLoopEnd,
  useLoopStart,
  usePlayhead,
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import { clamp } from "../../lib/playback/utils";
import { formatTimeOfDay } from "../TimelineControls/timeline-controls-utils";
import BufferedLaneShading from "./BufferedLaneShading";
import styles from "./TimelineRuler.module.css";

const MIN_VIEW = 0.25;
const CLICK_PX_THRESHOLD = 3;

// Nice tick spacings in seconds, ascending. We pick the smallest one that
// keeps the visible tick count at or below TARGET_TICK_DIVISIONS. Without
// this the interval capped at 1s, so a long file zoomed out crammed a label
// into every single second.
const TICK_INTERVALS = [
  0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
];
// Nice tick spacings in *frames* for sequence mode — ticks should land on
// whole frames, not arbitrary fractions of a second.
const SEQUENCE_FRAME_INTERVALS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];
const TARGET_TICK_DIVISIONS = 10;

// Tick positions always stay in the engine's internal seconds domain (see
// timeline-display.ts) — only the interval choice and the label text become
// mode-aware.
function chooseTickInterval(viewDuration: number, mode: TimelineMode): number {
  if (mode.kind === "sequence") {
    const step = 1 / mode.fps;
    for (const frames of SEQUENCE_FRAME_INTERVALS) {
      const interval = frames * step;
      if (viewDuration / interval <= TARGET_TICK_DIVISIONS) return interval;
    }
    return SEQUENCE_FRAME_INTERVALS[SEQUENCE_FRAME_INTERVALS.length - 1] * step;
  }
  for (const interval of TICK_INTERVALS) {
    if (viewDuration / interval <= TARGET_TICK_DIVISIONS) return interval;
  }
  return TICK_INTERVALS[TICK_INTERVALS.length - 1];
}

function durationTickLabel(t: number): string {
  const s = Math.floor(t);
  const frac = Math.round((t - s) * 10) / 10;
  // Past a minute, seconds-only labels ("150s") get hard to read on long
  // files; switch to m:ss. Intervals at this scale are whole seconds, so the
  // fractional branch below only matters for sub-minute zoomed-in views.
  if (t >= 60) {
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return frac === 0 ? `${s}s` : `${(s + frac).toFixed(1)}s`;
}

function tickLabel(
  t: number,
  mode: TimelineMode,
  conversion: TimelineDisplayConversion,
): string {
  if (mode.kind === "duration") return durationTickLabel(t);
  const displayValue = conversion.toDisplay(t);
  if (mode.kind === "sequence") return `${Math.round(displayValue as number)}`;
  // absolute: HH:MM:SS.mmm — a full date is redundant tick-over-tick.
  return formatTimeOfDay(displayValue as Date);
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
  const { duration, seekSnapped, setView, setLoop, settleSeek } = usePlayback();
  const { mode, ...displayConversion } = useTimelineDisplay();
  const hoverTime = useHoverTime();
  const store = usePlaybackStore();

  // Sequence mode has no such thing as frame 2.5 — `quantizeDuringScrub`
  // (see timeline-display.ts) says the display conversion should round
  // mid-drag positions onto whole frames. This is mode-intrinsic and
  // independent of `snapToFrameOnSettle` (a separate, provider-level
  // opt-in for snapping only at drag-end), so it's applied here before
  // handing the value to `seekSnapped` rather than left to that setting.
  const quantizeForScrub = (seconds: number): number =>
    displayConversion.quantizeDuringScrub
      ? displayConversion.fromDisplay(displayConversion.toDisplay(seconds))
      : seconds;

  const rulerRef = useRef<HTMLDivElement>(null);

  // Publish the timeline time under the pointer so every hover-capable
  // surface (plot panels, this ruler) can render one shared caret.
  const publishHover = (clientX: number) => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const laneWidth = rect.width - labelWidth;
    const laneX = clientX - rect.left - labelWidth;
    // The NaN guard matters: a pointer event without coordinates must
    // clear rather than publish NaN.
    if (
      !Number.isFinite(laneX) ||
      laneWidth <= 0 ||
      laneX < 0 ||
      laneX > laneWidth
    ) {
      setHoverTime(store, null);
      return;
    }
    setHoverTime(
      store,
      clamp(
        viewStart + (laneX / laneWidth) * (viewEnd - viewStart),
        0,
        duration,
      ),
    );
  };

  // This effect clears a hover this ruler may still be publishing when it
  // unmounts, so no stale caret survives in sibling surfaces.
  useEffect(
    () => () => {
      setHoverTime(store, null);
    },
    [store],
  );

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
      // `seekSnapped` quantizes to the displayed-frame start when the
      // provider opted into snap-to-frame; otherwise it's a plain seek. The
      // playhead now tracks discrete frame numbers continuously during the
      // drag, matching the frame-indexed mental model the annotation surface
      // uses elsewhere.
      seekSnapped(
        quantizeForScrub(
          clamp(startValue + (delta / laneWidth) * vd, 0, duration),
        ),
      );
    },
    // Flush the final target immediately instead of waiting out any trailing
    // fetch debounce; settle snapping is applied by the same action.
    onDragEnd: settleSeek,
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
      // `seekSnapped` lands the click on a frame boundary in one step when
      // snapping is enabled; falls back to a continuous seek otherwise.
      seekSnapped(
        quantizeForScrub(
          clamp(vs + (laneX / laneWidth) * (ve - vs), 0, duration),
        ),
      );
      settleSeek();
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

  const tickInterval = chooseTickInterval(viewDuration, mode);
  const ticks: number[] = [];
  const firstTick = Math.ceil(viewStart / tickInterval - 1e-9) * tickInterval;
  // `chooseTickInterval` targets ~TARGET_TICK_DIVISIONS ticks per view, but
  // it can't fully protect against a corrupt/mismeasured duration (e.g. a
  // scene whose streams disagree on epoch vs. elapsed time) blowing the
  // view out to years. This cap is the last line of defense against
  // rendering millions of tick nodes and hanging the tab.
  const MAX_TICKS = 500;
  for (
    let t = Math.round(firstTick * 1e4) / 1e4;
    t <= viewEnd + 1e-9 && ticks.length < MAX_TICKS;
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
      publishHover(e.clientX);
      laneDrag.handleProps.onPointerMove(e);
    },
    onPointerLeave: () => {
      setHoverTime(store, null);
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
        <BufferedLaneShading />
        {ticks.map((t) => (
          <span
            key={t}
            className={styles.tick}
            style={{
              left: `${((t - viewStart) / viewDuration) * 100}%`,
            }}
          >
            {tickLabel(t, mode, displayConversion)}
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

      {hoverTime !== null &&
      hoverTime >= viewStart - 1e-9 &&
      hoverTime <= viewEnd + 1e-9 ? (
        <div
          className={styles.hoverCaret}
          data-testid="timeline-hover-caret"
          style={{
            left: laneLeft(clamp((hoverTime - viewStart) / viewDuration, 0, 1)),
          }}
        />
      ) : null}

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
          data-testid="timeline-playhead-handle"
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
