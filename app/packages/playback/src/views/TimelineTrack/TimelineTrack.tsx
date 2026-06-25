import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  useViewEnd,
  useViewStart,
} from "../../lib/playback/use-playback-state";
import {
  Button,
  ContextMenu,
  IconName,
  MenuSeparator,
  MenuTextItem,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import React, { useRef, useState } from "react";
import styles from "./TimelineTrack.module.css";

/**
 * One event on a track. A `number` is shorthand for a point at that
 * time; an object with an `endSec` renders as an interval bar, without
 * one as a point. Object events with `endSec` may opt into in-place edit via
 * `resizable: true`; combined with {@link TimelineTrackProps.onEventEdit}
 * the bar renders left/right drag handles and a draggable body.
 */
export type TimelineTrackEvent =
  | number
  | {
      startSec: number;
      endSec?: number;
      label?: string;
      /** Free-form payload — anything the source produced about this event. */
      data?: unknown;
      /**
       * Opt into interval edit (drag handles + draggable body). Only
       * meaningful on interval events (`endSec` set) and only when
       * the parent track provides
       * {@link TimelineTrackProps.onEventEdit}.
       */
      resizable?: boolean;
    };

export interface NormalizedEvent {
  startSec: number;
  endSec?: number;
  label?: string;
  data?: unknown;
  resizable?: boolean;
}

/** A custom action contributed to a track event's context menu. */
export interface TrackEventMenuItem {
  /** Menu text, e.g. "Delete track" or "Split at playhead". */
  label: string;
  /** Render in the destructive (red) style. */
  destructive?: boolean;
  /** Grey out and ignore clicks (e.g. "Merge into…" with no candidates). */
  disabled?: boolean;
  /** Receives the event the menu was opened on. */
  onSelect: (event: NormalizedEvent) => void;
}

function normalizeEvent(e: TimelineTrackEvent): NormalizedEvent {
  return typeof e === "number" ? { startSec: e } : e;
}

/**
 * Drag mode for an in-progress interval edit. `move` shifts both start
 * and end by the same delta; `resize-start` / `resize-end` move only
 * one boundary. Reported to {@link TimelineTrackProps.onEventEdit} so
 * consumers can react differently per mode (e.g. extend vs. shift a
 * tracked object).
 */
export type DragMode = "resize-start" | "resize-end" | "move";

interface DragState {
  index: number;
  initialClientX: number;
  laneWidth: number;
  origStart: number;
  origEnd: number;
  mode: DragMode;
  moved: boolean;
  latestStart: number;
  latestEnd: number;
}

const DRAG_THRESHOLD_PX = 3;

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
  /**
   * Custom items appended (below a separator) to an event's context menu.
   * Each `onSelect` receives the event the menu was opened on — the handler
   * decides whether that means the single event or the whole track. Supply
   * per-row via `decorateTrack` or uniformly via
   * {@link TimelineWithTracksProps.eventMenuItems}. Empty/omitted adds nothing.
   */
  eventMenuItems?: TrackEventMenuItem[];
  /** Override the label column text. Defaults to `id`. */
  label?: string;
  height?: number;
  labelWidth?: number;
  pinned?: boolean;
  onPinClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  /** Fired on the row root. Used for cross-component hover linking. */
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Fired on the row root. Used for cross-component hover linking. */
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /**
   * Fired when the track row is clicked anywhere except the pin button
   * or an event marker / interval bar. Lane clicks still seek.
   * `onTrackClick` runs alongside the seek, not in place of it.
   */
  onTrackClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /**
   * Fires on pointer-up after a drag has crossed{@link DRAG_THRESHOLD_PX},
   * never during the drag itself. Receives the event's index in the
   * {@link events} array, the final clamped + snapped `[start, end]`
   * (seconds), and the {@link DragMode} that produced the edit (so a
   * consumer can tell an edge extend/trim from a whole-bar move).
   *
   * Only events with `resizable: true` participate; without this prop
   * the resizable flag is a no-op and the bar renders as before.
   */
  onEventEdit?: (
    eventIndex: number,
    newStartSec: number,
    newEndSec: number,
    mode: DragMode
  ) => void;
  /**
   * Snap step (seconds) for drag-driven edits. Typically `1 / fps`,
   * so interval edges land on frame boundaries. Omit for free-time
   * drags.
   */
  snapStepSec?: number;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
  id,
  color,
  bg,
  start,
  end,
  events = [],
  onEventClick,
  eventMenuItems,
  label,
  height = 28,
  labelWidth = 0,
  pinned = false,
  onPinClick,
  onContextMenu,
  className,
  onMouseEnter,
  onMouseLeave,
  onTrackClick,
  onEventEdit,
  snapStepSec,
}) => {
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const { seek, setLoop } = usePlayback();

  const laneRef = useRef<HTMLDivElement>(null);

  /**
   * In-progress drag state. Mirrored in a ref because the document-
   * level pointermove / pointerup handlers must read the latest values
   * without re-binding on every render.
   */
  const dragRef = useRef<DragState | null>(null);

  /**
   * Local visual override applied while the user is dragging an
   * interval bar. `null` when not dragging; cleared on pointerup.
   * Render reads this so the bar tracks the cursor without committing
   * anything until the user lets go. `mode` + the original bounds let a
   * `move` drag also offset the point events (e.g. keyframe diamonds)
   * sitting inside the bar, so they stay attached to it during the drag.
   */
  const [dragOverride, setDragOverride] = useState<{
    index: number;
    startSec: number;
    endSec: number;
    mode: DragMode;
    origStartSec: number;
    origEndSec: number;
  } | null>(null);

  /**
   * Flag set in pointerup-after-drag so the synthetic click event the
   * browser fires immediately after can be suppressed (otherwise the
   * lane's lane-click handler would seek to the drop point).
   */
  const justDraggedRef = useRef(false);

  const viewDuration = viewEnd - viewStart;
  // Degenerate view (zero/negative width) — would produce NaN/Infinity
  // CSS values and break layout for every bar/marker below.
  if (viewDuration <= 0) return null;
  const pct = (t: number) => `${((t - viewStart) / viewDuration) * 100}%`;

  const snap = (t: number): number => {
    if (!snapStepSec || snapStepSec <= 0 || !Number.isFinite(snapStepSec)) {
      return t;
    }
    return Math.round(t / snapStepSec) * snapStepSec;
  };

  const beginIntervalDrag = (
    mouseEvent: React.MouseEvent<HTMLDivElement>,
    eventIndex: number,
    origStart: number,
    origEnd: number,
    mode: DragMode
  ): void => {
    if (!onEventEdit) return;

    // Only respond to the primary button. Right-click should fall
    // through to the existing ContextMenu wrapper, not begin a drag.
    if (mouseEvent.button !== 0) return;

    const lane = laneRef.current;
    if (!lane) return;

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();

    const rect = lane.getBoundingClientRect();
    const initialClientX = mouseEvent.clientX;

    dragRef.current = {
      index: eventIndex,
      initialClientX,
      laneWidth: rect.width,
      origStart,
      origEnd,
      mode,
      moved: false,
      latestStart: origStart,
      latestEnd: origEnd,
    };

    const onMove = (moveEv: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.laneWidth <= 0) {
        return;
      }

      const dx = moveEv.clientX - drag.initialClientX;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) {
        return;
      }
      drag.moved = true;

      const dSec = (dx / drag.laneWidth) * viewDuration;
      // Minimum interval width is the snap step (so an interval can't
      // collapse to zero seconds via resize). Without a snap step, we
      // still enforce a tiny floor to avoid `start === end` intervals.
      const minDuration = snapStepSec ?? 1e-6;

      let newStart = drag.origStart;
      let newEnd = drag.origEnd;

      if (drag.mode === "resize-start") {
        newStart = snap(drag.origStart + dSec);
        if (newStart > drag.origEnd - minDuration) {
          newStart = drag.origEnd - minDuration;
        }
        newEnd = drag.origEnd;
      } else if (drag.mode === "resize-end") {
        newEnd = snap(drag.origEnd + dSec);
        if (newEnd < drag.origStart + minDuration) {
          newEnd = drag.origStart + minDuration;
        }
        newStart = drag.origStart;
      } else {
        const width = drag.origEnd - drag.origStart;
        newStart = snap(drag.origStart + dSec);
        newEnd = newStart + width;
      }

      drag.latestStart = newStart;
      drag.latestEnd = newEnd;
      setDragOverride({
        index: drag.index,
        startSec: newStart,
        endSec: newEnd,
        mode: drag.mode,
        origStartSec: drag.origStart,
        origEndSec: drag.origEnd,
      });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      const drag = dragRef.current;
      dragRef.current = null;

      if (drag && drag.moved) {
        justDraggedRef.current = true;
        // Cleared on the next event-loop turn so the synthetic click
        // that pointerup fires can read it and bail.
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
        onEventEdit(drag.index, drag.latestStart, drag.latestEnd, drag.mode);
      }

      setDragOverride(null);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Background bar is rendered only when both start/end are provided.
  const hasBackground = start !== undefined && end !== undefined;
  const clippedStart = hasBackground ? Math.max(start, viewStart) : 0;
  const clippedEnd = hasBackground ? Math.min(end, viewEnd) : 0;
  const barVisible = hasBackground && clippedStart < clippedEnd;

  const labelText = label ?? id;

  // While moving an interval, point events (e.g. keyframe diamonds) that
  // live inside the dragged bar's *original* span should travel with it.
  // The bar follows the cursor via `dragOverride`; mirror the same offset
  // onto those points so they stay attached until drag-end commits the
  // shift. Resize drags don't move points (extend adds filler, trim
  // deletes frames) — so this only applies to `move`.
  const movePointShift =
    dragOverride && dragOverride.mode === "move"
      ? {
          delta: dragOverride.startSec - dragOverride.origStartSec,
          fromSec: dragOverride.origStartSec,
          toSec: dragOverride.origEndSec,
        }
      : null;

  return (
    <div
      className={clsx(styles.root, className)}
      style={{
        height,
        ...(onTrackClick ? { cursor: "pointer" } : null),
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onTrackClick}
      data-track-id={id}
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
        ref={laneRef}
        className={styles.lane}
        onClick={(e) => {
          // Suppress the synthetic click the browser fires immediately
          // after a real drag so the drop point doesn't double as a seek.
          if (justDraggedRef.current) return;

          // Portal-rendered context-menu items bubble through the React tree
          // but live outside this element's DOM subtree — ignore them so
          // dismissing the menu doesn't fire an unintended seek.
          if (!e.currentTarget.contains(e.target as Node)) return;

          const target = e.target as HTMLElement;
          // Event markers / bars own their own click — don't seek twice.
          if (
            target.classList.contains(styles.event) ||
            target.classList.contains(styles.intervalBar) ||
            target.classList.contains(styles.resizeHandle)
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
          .map((event, originalIndex) => ({
            event: normalizeEvent(event),
            originalIndex,
          }))
          .filter(({ event }) =>
            event.endSec !== undefined
              ? event.endSec >= viewStart && event.startSec <= viewEnd
              : event.startSec >= viewStart && event.startSec <= viewEnd
          )
          .map(({ event, originalIndex }) => {
            const handleClick = (ev: React.MouseEvent) => {
              // Suppress the synthetic click that pointerup fires
              // right after a resize / move drag — otherwise the drop
              // point seeks unexpectedly.
              if (justDraggedRef.current) return;

              // Deliberately no stopPropagation. The click bubbles to
              // the row root so `onTrackClick` fires for marker / interval-bar
              // clicks too. The lane's onClick filters by target class so seek
              // doesn't double-fire.
              const lane = laneRef.current;
              if (lane) {
                const rect = lane.getBoundingClientRect();
                const t =
                  viewStart +
                  Math.max(
                    0,
                    Math.min(1, (ev.clientX - rect.left) / rect.width)
                  ) *
                    viewDuration;
                seek(t);
              }
              onEventClick?.(event);
            };
            const isInterval = event.endSec !== undefined;
            const isResizable = Boolean(
              isInterval && event.resizable && onEventEdit
            );

            // While a drag is in progress, render with the override
            // position so the bar tracks the cursor. Outside of drag,
            // use the event's own start / end.
            const override =
              dragOverride && dragOverride.index === originalIndex
                ? dragOverride
                : null;
            const displayStart = override ? override.startSec : event.startSec;
            const displayEnd = override
              ? override.endSec
              : (event.endSec as number);

            const menu = (
              <>
                <MenuTextItem onClick={() => seek(event.startSec)}>
                  Move to start
                </MenuTextItem>
                <MenuTextItem
                  disabled={!isInterval}
                  onClick={() => isInterval && seek(event.endSec!)}
                >
                  Move to end
                </MenuTextItem>
                <MenuSeparator />
                <MenuTextItem
                  disabled={!isInterval}
                  onClick={() =>
                    isInterval && setLoop(event.startSec, event.endSec!)
                  }
                >
                  Shrink window to fit
                </MenuTextItem>
                {eventMenuItems && eventMenuItems.length > 0 && (
                  <>
                    <MenuSeparator />
                    {eventMenuItems.map((item, i) => (
                      <MenuTextItem
                        key={i}
                        destructive={item.destructive}
                        disabled={item.disabled}
                        onClick={(ev) => {
                          // Stop the click bubbling to the row's `onClick`
                          // (`onTrackClick`).
                          ev.stopPropagation();

                          if (!item.disabled) {
                            item.onSelect(event);
                          }
                        }}
                      >
                        {item.label}
                      </MenuTextItem>
                    ))}
                  </>
                )}
              </>
            );
            if (isInterval) {
              const left = pct(Math.max(displayStart, viewStart));
              const right = Math.min(displayEnd, viewEnd);
              const width = `${
                ((right - Math.max(displayStart, viewStart)) / viewDuration) *
                100
              }%`;
              return (
                <ContextMenu key={originalIndex} menu={menu}>
                  <div
                    className={styles.intervalBar}
                    data-event-index={originalIndex}
                    style={{
                      left,
                      width,
                      background: `${color}99`,
                      border: `1px solid ${color}`,
                      cursor: isResizable ? "grab" : "pointer",
                    }}
                    title={
                      event.label
                        ? `${event.label}  (${displayStart.toFixed(
                            2
                          )}-${displayEnd.toFixed(2)}s)`
                        : `${labelText}  (${displayStart.toFixed(
                            2
                          )}-${displayEnd.toFixed(2)}s)`
                    }
                    onClick={handleClick}
                    onMouseDown={
                      isResizable
                        ? (ev) =>
                            beginIntervalDrag(
                              ev,
                              originalIndex,
                              event.startSec,
                              event.endSec!,
                              "move"
                            )
                        : undefined
                    }
                  >
                    {isResizable && (
                      <>
                        <div
                          className={clsx(
                            styles.resizeHandle,
                            styles.resizeHandleStart
                          )}
                          data-event-index={originalIndex}
                          data-resize-handle="start"
                          aria-label="Resize interval start"
                          onClick={(ev) => ev.stopPropagation()}
                          onMouseDown={(ev) =>
                            beginIntervalDrag(
                              ev,
                              originalIndex,
                              event.startSec,
                              event.endSec!,
                              "resize-start"
                            )
                          }
                        />
                        <div
                          className={clsx(
                            styles.resizeHandle,
                            styles.resizeHandleEnd
                          )}
                          data-event-index={originalIndex}
                          data-resize-handle="end"
                          aria-label="Resize interval end"
                          onClick={(ev) => ev.stopPropagation()}
                          onMouseDown={(ev) =>
                            beginIntervalDrag(
                              ev,
                              originalIndex,
                              event.startSec,
                              event.endSec!,
                              "resize-end"
                            )
                          }
                        />
                      </>
                    )}
                  </div>
                </ContextMenu>
              );
            }
            // Offset points inside the dragged bar's original span by the
            // live move delta so they track the bar. `1e-6` absorbs float
            // drift; original event/interval bounds are otherwise exact.
            const pointSec =
              movePointShift &&
              event.startSec >= movePointShift.fromSec - 1e-6 &&
              event.startSec <= movePointShift.toSec + 1e-6
                ? event.startSec + movePointShift.delta
                : event.startSec;
            return (
              <ContextMenu key={originalIndex} menu={menu}>
                <div
                  className={styles.event}
                  style={{ left: pct(pointSec), background: color }}
                  title={
                    event.label
                      ? `${event.label}  @ ${event.startSec.toFixed(3)}s`
                      : `${labelText} @ ${event.startSec.toFixed(3)}s`
                  }
                  onClick={handleClick}
                />
              </ContextMenu>
            );
          })}
      </div>
    </div>
  );
};

export default TimelineTrack;
