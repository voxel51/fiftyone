/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import clsx from "clsx";
import React, {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keyTarget, type Orientation } from "./keys";
import {
  nearestTick,
  positionToRank,
  type RailTick,
  railMode,
  rankLabel,
  rankTicks,
  thumbPosition,
  thumbSpan,
  thumbTop,
} from "./model";
import styles from "./Rail.module.css";

const TICKS = 5;
const MIN_SPAN = 0.03;
const AWAKE_MS = 1200;

export interface RankRailProps {
  total: number;
  anchorRank?: number;
  /** Estimated items on screen, for the thumb's length. */
  visible?: number;
  /** Fires on release with the rail position in [0, 1]. */
  onJump: (position: number) => void;
  orientation?: Orientation;
  /** Markers; evenly spaced ranks by default. */
  ticks?: readonly RailTick[];
  /** The floating label for a rank; "#rank of N" by default. */
  label?: (rank: number, total: number) => string;
  /** Placement, for rails that are not on the grid's edge. */
  className?: string;
  "aria-label"?: string;
}

const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * A thin rail over ranks. What it rails over is left alone while dragging;
 * the jump happens on release.
 */
function RankRail({
  anchorRank,
  className,
  label = rankLabel,
  onJump,
  orientation = "vertical",
  ticks: given,
  total,
  visible,
  "aria-label": ariaLabel = "Grid rail",
}: RankRailProps) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const even = useMemo(() => rankTicks(total, TICKS), [total]);
  const ticks = given ?? even;

  useEffect(() => {
    if (anchorRank === undefined) return undefined;
    setScrolling(true);
    const timeout = setTimeout(() => setScrolling(false), AWAKE_MS);
    return () => clearTimeout(timeout);
  }, [anchorRank]);

  if (total <= 0) return null;

  const horizontal = orientation === "horizontal";
  const start = horizontal ? "left" : "top";
  const extent = horizontal ? "width" : "height";
  const at = (event: PointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    const size = rect?.[extent] ?? 0;
    if (!rect || size === 0) return 0;
    const offset = horizontal
      ? event.clientX - rect.left
      : event.clientY - rect.top;
    return Math.min(Math.max(offset / size, 0), 1);
  };
  const position = drag ?? thumbPosition(anchorRank, total);
  const span = thumbSpan(visible, total, MIN_SPAN);
  const pointer = drag ?? hover;
  const mode = railMode({
    dragging: drag !== null,
    hovered: hover !== null,
    scrolling,
  });
  const nearest = pointer === null ? -1 : nearestTick(ticks, pointer);
  // the pill already reads out a marker the pointer sits on
  const labelled =
    nearest >= 0 && Math.abs(ticks[nearest].position - (pointer ?? 0)) > 0.04;

  const onKeyDown = (event: KeyboardEvent) => {
    const target = keyTarget(event.key, position, orientation);
    if (target === undefined) return;
    event.preventDefault();
    onJump(target);
  };

  return (
    <div
      className={clsx(
        styles.rail,
        horizontal && styles.horizontal,
        styles[mode],
        drag !== null && styles.drag,
        className,
      )}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={positionToRank(position, total) + 1}
      aria-valuetext={label(positionToRank(position, total), total)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag(at(event));
      }}
      onPointerMove={(event) => {
        const next = at(event);
        drag === null ? setHover(next) : setDrag(next);
      }}
      onPointerUp={(event) => {
        if (drag === null) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(null);
        onJump(at(event));
      }}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
    >
      <div ref={track} className={styles.track}>
        {ticks.map((tick, index) => (
          <div
            key={index}
            className={clsx(styles.marker, index === nearest && styles.near)}
            style={{ [start]: percent(tick.position) }}
          >
            {index === nearest && labelled && (
              <span className={styles.markerLabel}>{tick.label}</span>
            )}
          </div>
        ))}
        <div
          className={styles.thumb}
          style={{
            [start]: percent(thumbTop(position, span)),
            [extent]: percent(span),
          }}
        />
        {pointer !== null && (
          <div className={styles.pill} style={{ [start]: percent(pointer) }}>
            {label(positionToRank(pointer, total), total)}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(RankRail);
