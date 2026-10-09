/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import clsx from "clsx";
import React, {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { keyTarget, type Orientation } from "./keys";
import { nearestTick, type RailTick, railMode } from "./model";
import styles from "./Rail.module.css";
import useThumbMotion from "./useThumbMotion";

const AWAKE_MS = 1200;

export interface RailProps {
  /** The thumb's place, in [0, 1]; the start until known. */
  position?: number;
  /** The thumb's share of the track. */
  span: number;
  ticks: readonly RailTick[];
  /** What a rail position reads as, for the pointer's pill. */
  label: (position: number) => string;
  /** Fires once, on release, with the rail position in [0, 1]. */
  onJump: (position: number) => void;
  /** The grid is fetching or rebuilding; the track shows it. */
  loading?: boolean;
  /** Subscribes the thumb to the scroll, between rows too. */
  follow?: (listener: (position: number) => void) => () => void;
  orientation?: Orientation;
  /** Placement, for rails that are not on the grid's edge. */
  className?: string;
  "aria-label"?: string;
}

const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * A thin rail. What it rails over is left alone while dragging: nothing is
 * fetched until the release, which jumps once.
 */
function Rail({
  className,
  follow,
  label,
  loading = false,
  onJump,
  orientation = "vertical",
  position: resting = 0,
  span,
  ticks,
  "aria-label": ariaLabel = "Grid rail",
}: RailProps) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    setScrolling(true);
    const timeout = setTimeout(() => setScrolling(false), AWAKE_MS);
    return () => clearTimeout(timeout);
  }, [resting]);

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
  const position = drag ?? resting;
  const pointer = drag ?? hover;

  // the thumb moves outside React: a drag places it, everything else eases it
  const aim = useThumbMotion({ span, start, thumb });
  const dragging = drag !== null;
  useLayoutEffect(() => {
    if (drag !== null) aim(drag, true);
    else aim(resting);
  }, [aim, drag, resting]);
  useEffect(() => {
    if (!follow || dragging) return undefined;
    return follow((next) => aim(next));
  }, [aim, dragging, follow]);

  const mode = railMode({
    dragging,
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
        dragging && styles.drag,
        loading && styles.loading,
        className,
      )}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
      aria-valuetext={label(position)}
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
      <div ref={track} className={styles.track} aria-busy={loading}>
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
          ref={thumb}
          className={styles.thumb}
          style={{ [extent]: percent(span) }}
        />
        {pointer !== null && (
          <div className={styles.pill} style={{ [start]: percent(pointer) }}>
            {label(pointer)}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(Rail);
