/* eslint-disable react/no-unknown-property */
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import { laneLeftCalc } from "../utils/timeline-utils";
import { fmtBound } from "../TimelineControls/timeline-controls-utils";
import { useTemporalTagContext } from "./TemporalTagContext";
import styles from "./TemporalTag.module.css";
import { clamp } from "../../lib/playback/utils";

export interface TemporalTagRangeOverlayProps {
  labelWidth: number;
}

/**
 * Full-area overlay that captures pointer events during temporal-tag
 * range selection.  Normally `pointer-events: none` so the ruler and
 * track events pass through unaffected.
 *
 * Activates in three ways:
 *  1. Tag-mode button / `T` hotkey  → `phase === "ready"`
 *  2. Shift + click-drag anywhere    → enters selecting immediately
 *  3. Already selecting / selected   → stays active
 */
const TemporalTagRangeOverlay: React.FC<TemporalTagRangeOverlayProps> = ({
  labelWidth,
}) => {
  const ctx = useTemporalTagContext();
  const { seek } = usePlayback();
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Track shift key so overlay can intercept shift+drag even in idle mode.
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(e.type === "keydown");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Live cursor time shown in the tooltip while dragging.
  const [cursorTime, setCursorTime] = useState<{
    time: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const pixelToTime = useCallback(
    (clientX: number): number => {
      const el = overlayRef.current;
      if (!el) return viewStart;
      const rect = el.getBoundingClientRect();
      const laneX = clientX - rect.left - labelWidth;
      const laneWidth = rect.width - labelWidth;
      if (laneWidth <= 0) return viewStart;
      const vd = viewEnd - viewStart;
      // If the view hasn't been initialised yet (vd === 0), synthesise a
      // unit range [0,1] from pixel position so at least non-zero times
      // can be produced and the selection won't be rejected.
      if (vd === 0) return clamp(laneX / laneWidth, 0, 1);
      return clamp(viewStart + (laneX / laneWidth) * vd, viewStart, viewEnd);
    },
    [viewStart, viewEnd, labelWidth],
  );

  // Capture layout at drag start for stable coordinate math.
  const dragRef = useRef<{ startTime: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!ctx) return;

      const isShiftDrag = e.shiftKey;
      const phase = ctx.state.phase;

      // Allow: shift+drag (any phase), or when already in ready/selected mode.
      if (!isShiftDrag && phase !== "ready" && phase !== "selected") return;

      e.preventDefault();
      e.stopPropagation();
      const startTime = pixelToTime(e.clientX);
      dragRef.current = { startTime };

      if (phase === "idle") {
        ctx.actions.enterTagMode();
      }

      ctx.actions.startDrag(startTime);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [ctx, pixelToTime],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const time = pixelToTime(e.clientX);
      setCursorTime({ time, clientX: e.clientX, clientY: e.clientY });
      // Always call — updateDrag's functional setState updater guards phase
      // internally, so stale-closure checks here would misfire if the
      // phase state update from startDrag hasn't committed yet.
      ctx?.actions.updateDrag(time);
      if (ctx?.state.phase === "selecting") seek(time);
    },
    [ctx, pixelToTime, seek],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Anchor the popup to the bottom of the ruler so it appears just below it.
      const rulerBottom =
        overlayRef.current?.getBoundingClientRect().bottom ?? e.clientY;
      ctx?.actions.finishDrag(e.clientX, rulerBottom);
    },
    [ctx],
  );

  const handlePointerLeave = useCallback(() => {
    setCursorTime(null);
  }, []);

  // Escape closes tag mode at any phase.
  useEffect(() => {
    if (!ctx) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ctx.state.phase !== "idle") {
        ctx.actions.exitTagMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ctx]);

  if (!ctx) return null;

  const { phase, previewStart, previewEnd, selection } = ctx.state;

  // Derive ratio helpers.
  const viewDuration = viewEnd - viewStart;
  const ratio = (t: number) =>
    viewDuration > 0 ? clamp((t - viewStart) / viewDuration, 0, 1) : 0;

  // Which range to visualize: preview during drag, selection after.
  const visStart =
    phase === "selecting"
      ? Math.min(previewStart ?? 0, previewEnd ?? 0)
      : (selection?.start ?? 0);
  const visEnd =
    phase === "selecting"
      ? Math.max(previewStart ?? 0, previewEnd ?? 0)
      : (selection?.end ?? 0);

  const showMask =
    (phase === "selecting" || phase === "selected") && visEnd > visStart;

  return (
    <>
      <div
        ref={overlayRef}
        className={[
          styles.overlay,
          phase === "ready" ||
          phase === "selected" ||
          (phase === "idle" && shiftHeld)
            ? styles.overlayActive
            : "",
          phase === "ready" ? styles.overlayReady : "",
          phase === "selecting" ? styles.overlaySelecting : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* "Select Range" hint in the label column while selecting */}
        {(phase === "ready" || phase === "selecting") && labelWidth > 0 && (
          <div className={styles.selectRangeHint} style={{ width: labelWidth }}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Select Range
            </Text>
          </div>
        )}

        {showMask && (
          <div
            className={styles.selectionMask}
            style={{
              left: laneLeftCalc(ratio(visStart), labelWidth),
              width: `calc(${laneLeftCalc(
                ratio(visEnd),
                labelWidth,
              )} - ${laneLeftCalc(ratio(visStart), labelWidth)})`,
            }}
          />
        )}

        {/* Start handle — shown after selection committed */}
        {phase === "selected" && selection && (
          <StartHandle
            ratio={ratio(selection.start)}
            labelWidth={labelWidth}
            time={selection.start}
            selection={selection}
            pixelToTime={pixelToTime}
            ctx={ctx}
          />
        )}

        {/* End handle — shown after selection committed */}
        {phase === "selected" && selection && (
          <EndHandle
            ratio={ratio(selection.end)}
            labelWidth={labelWidth}
            time={selection.end}
            selection={selection}
            pixelToTime={pixelToTime}
            ctx={ctx}
          />
        )}

        {/* Time label at start edge during drag */}
        {phase === "selecting" &&
          previewStart !== null &&
          overlayRef.current && (
            <HandleTooltip
              time={previewStart}
              ratio={ratio(previewStart)}
              labelWidth={labelWidth}
              containerRef={overlayRef}
            />
          )}
      </div>

      {/* Cursor time tooltip follows mouse during selecting */}
      {phase === "selecting" && cursorTime && (
        <div
          className={styles.timeTooltip}
          style={{
            left: cursorTime.clientX,
            top: cursorTime.clientY - 32,
          }}
        >
          {fmtBound(cursorTime.time)}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Draggable handles for adjusting a committed selection
// ---------------------------------------------------------------------------

interface HandleProps {
  ratio: number;
  labelWidth: number;
  time: number;
  selection: { start: number; end: number };
  pixelToTime: (clientX: number) => number;
  ctx: NonNullable<ReturnType<typeof useTemporalTagContext>>;
}

const StartHandle: React.FC<HandleProps> = ({
  ratio,
  labelWidth,
  time,
  selection,
  pixelToTime,
  ctx,
}) => {
  const dragRef = useRef<{ startClientX: number; originalTime: number } | null>(
    null,
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragRef.current = {
      startClientX: e.clientX,
      originalTime: selection.start,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const t = clamp(pixelToTime(e.clientX), 0, selection.end - 0.05);
    ctx.actions.setAnchorHandle(t, selection.end);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={styles.handle}
      style={{ left: laneLeftCalc(ratio, labelWidth) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={`Start: ${fmtBound(time)}`}
    >
      <div className={styles.handleLine} />
    </div>
  );
};

const EndHandle: React.FC<HandleProps> = ({
  ratio,
  labelWidth,
  time,
  selection,
  pixelToTime,
  ctx,
}) => {
  const dragRef = useRef<{ startClientX: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragRef.current = { startClientX: e.clientX };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const t = clamp(pixelToTime(e.clientX), selection.start + 0.05, Infinity);
    ctx.actions.setAnchorHandle(selection.start, t);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className={styles.handle}
      style={{ left: laneLeftCalc(ratio, labelWidth) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={`End: ${fmtBound(time)}`}
    >
      <div className={styles.handleLine} />
    </div>
  );
};

// Tooltip anchored to a specific ratio position (e.g. drag start label).
const HandleTooltip: React.FC<{
  time: number;
  ratio: number;
  labelWidth: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ time, ratio, labelWidth, containerRef }) => {
  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const laneWidth = rect.width - labelWidth;
  const clientX = rect.left + labelWidth + ratio * laneWidth;

  return (
    <div
      className={styles.timeTooltip}
      style={{ left: clientX, top: rect.top - 8 }}
    >
      {fmtBound(time)}
    </div>
  );
};

export default TemporalTagRangeOverlay;
