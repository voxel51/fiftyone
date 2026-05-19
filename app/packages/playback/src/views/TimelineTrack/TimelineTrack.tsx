import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import {
  Button,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";
import styles from "./TimelineTrack.module.css";

/**
 * One event on a track. A `number` is shorthand for a point at that
 * time; an object with an `endSec` renders as an interval bar, without
 * one as a point.
 */
export type TimelineTrackEvent =
  | number
  | { startSec: number; endSec?: number; label?: string };

interface NormalizedEvent {
  startSec: number;
  endSec?: number;
  label?: string;
}

function normalizeEvent(e: TimelineTrackEvent): NormalizedEvent {
  return typeof e === "number" ? { startSec: e } : e;
}

export interface TimelineTrackProps {
  id: string;
  color: string;
  bg?: string;
  /**
   * Optional "background bar" running from `start` → `end`. Useful for
   * showing the extent of a continuous stream. Omit for semantic tracks
   * that are just a sequence of events.
   */
  start?: number;
  end?: number;
  /**
   * Event list. Numbers render as point markers (legacy / continuous
   * streams). Objects render as either an interval bar (when `endSec`
   * is set) or a point.
   */
  events?: TimelineTrackEvent[];
  /** Fired when an event marker / bar is clicked. Typically seeks. */
  onEventClick?: (event: NormalizedEvent) => void;
  /** Override the label column text. Defaults to `id`. */
  label?: string;
  height?: number;
  labelWidth?: number;
  pinned?: boolean;
  onPinClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
  id,
  color,
  bg,
  start,
  end,
  events = [],
  onEventClick,
  label,
  height = 28,
  labelWidth = 0,
  pinned = false,
  onPinClick,
  onContextMenu,
  className,
}) => {
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const { seek } = usePlayback();

  const viewDuration = viewEnd - viewStart;
  // Degenerate view (zero/negative width) — would produce NaN/Infinity
  // CSS values and break layout for every bar/marker below.
  if (viewDuration <= 0) return null;
  const pct = (t: number) =>
    `${((t - viewStart) / viewDuration) * 100}%`;

  // Background bar is rendered only when both start/end are provided.
  const hasBackground = start !== undefined && end !== undefined;
  const clippedStart = hasBackground ? Math.max(start, viewStart) : 0;
  const clippedEnd = hasBackground ? Math.min(end, viewEnd) : 0;
  const barVisible = hasBackground && clippedStart < clippedEnd;

  const labelText = label ?? id;

  return (
    <div
      className={clsx(styles.root, className)}
      style={{ height }}
      onContextMenu={onContextMenu}
    >
      {labelWidth > 0 && (
        <div className={styles.label} style={{ width: labelWidth }}>
          <div className={styles.dot} style={{ background: color }} />
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Primary}
            className={styles.labelText}
          >
            {labelText}
          </Text>
          {onPinClick && (
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              data-testid={`timeline-track-pin-${id}`}
              leadingIcon={IconName.Pin}
              aria-label={pinned ? "Unpin track" : "Pin track"}
              aria-pressed={pinned}
              className={clsx(styles.pinButton, {
                [styles.pinButtonActive]: pinned,
              })}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick();
              }}
            />
          )}
        </div>
      )}

      <div
        className={styles.lane}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // Event markers / bars own their own click — don't seek twice.
          if (
            target.classList.contains(styles.event) ||
            target.classList.contains(styles.intervalBar)
          )
            return;
          const rect = e.currentTarget.getBoundingClientRect();
          seek(
            viewStart +
              ((e.clientX - rect.left) / rect.width) * (viewEnd - viewStart)
          );
        }}
      >
        {barVisible && (
          <div
            className={styles.bar}
            style={{
              left: pct(clippedStart),
              width: `${((clippedEnd - clippedStart) / viewDuration) * 100}%`,
              background: bg ?? `${color}55`,
              border: `1px solid ${color}88`,
            }}
          />
        )}
        {events
          .map(normalizeEvent)
          .filter((e) =>
            e.endSec !== undefined
              ? e.endSec >= viewStart && e.startSec <= viewEnd
              : e.startSec >= viewStart && e.startSec <= viewEnd
          )
          .map((e, i) => {
            const handleClick = (ev: React.MouseEvent) => {
              ev.stopPropagation();
              if (onEventClick) onEventClick(e);
              else seek(e.startSec);
            };
            if (e.endSec !== undefined) {
              const left = pct(Math.max(e.startSec, viewStart));
              const right = Math.min(e.endSec, viewEnd);
              const width = `${
                ((right - Math.max(e.startSec, viewStart)) / viewDuration) *
                100
              }%`;
              return (
                <div
                  key={i}
                  className={styles.intervalBar}
                  style={{
                    left,
                    width,
                    background: `${color}99`,
                    border: `1px solid ${color}`,
                  }}
                  title={
                    e.label
                      ? `${e.label}  (${e.startSec.toFixed(2)}–${e.endSec.toFixed(2)}s)`
                      : `${labelText}  (${e.startSec.toFixed(2)}–${e.endSec.toFixed(2)}s)`
                  }
                  onClick={handleClick}
                />
              );
            }
            return (
              <div
                key={i}
                className={styles.event}
                style={{ left: pct(e.startSec), background: color }}
                title={
                  e.label
                    ? `${e.label}  @ ${e.startSec.toFixed(3)}s`
                    : `${labelText} @ ${e.startSec.toFixed(3)}s`
                }
                onClick={handleClick}
              />
            );
          })}
      </div>
    </div>
  );
};

export default TimelineTrack;
