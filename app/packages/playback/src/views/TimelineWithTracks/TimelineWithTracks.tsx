import { Drawer, useDragDelta } from "@voxel51/voodo";
import clsx from "clsx";
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DRAWER_MAX_SIZE,
  TIMELINE_LABEL_WIDTH,
} from "../../lib/constants";
import {
  useTrackPinning,
  useTracks,
  type Track,
} from "../../lib/tracks/TrackProvider";
import LoopOverlays from "../Loop/LoopOverlays";
import PlayheadLine from "../Playhead/PlayheadLine";
import TimelineHeader from "../TimelineHeader/TimelineHeader";
import TimelineTrack, {
  type TimelineTrackProps,
  type TrackEventMenuItem,
} from "../TimelineTrack/TimelineTrack";
import { partitionTracksByPin } from "./partitionTracksByPin";
import styles from "./TimelineWithTracks.module.css";

export interface TimelineWithTracksProps {
  /**
   * Optional readiness signal stamped on the root as
   * `data-timeline-loaded` so tests can wait for tracks to be committed
   * instead of polling. Omit to leave the attribute off entirely.
   */
  loaded?: boolean;
  /**
   * Width of the label column, and the floor the user may drag it back down
   * to. The ceiling is the widest label currently rendered, so dragging can
   * reveal truncated labels but never open dead space beyond them.
   * @default TIMELINE_LABEL_WIDTH
   */
  labelWidth?: number;
  /**
   * Initial open size of the drawer (px). Capped by content height.
   * @default TIMELINE_DEFAULT_DRAWER_SIZE
   */
  defaultSize?: number;
  /**
   * Hard ceiling on drawer height (px).
   * @default TIMELINE_DRAWER_MAX_SIZE
   */
  maxSize?: number;
  className?: string;
  /**
   * Whether the drawer starts open. Mount-time only — user toggles thereafter
   * persist until the next remount. Defaults closed; callers that want the
   * timeline visible immediately pass `true`.
   * @default false
   */
  defaultDrawerOpen?: boolean;
  /** Controlled open state for the tracks drawer. */
  drawerOpen?: boolean;
  /** Called when the tracks drawer requests an open-state change. */
  onDrawerOpenChange?: (open: boolean) => void;
  /** Overlay rendered on top of the ruler row in each TimelineHeader. */
  rulerOverlay?: React.ReactNode;
  /**
   * Custom context-menu items added to every track's events. Per-row overrides
   * can still be supplied via {@link decorateTrack}. See
   * {@link TimelineTrackProps.eventMenuItems}.
   */
  eventMenuItems?: TrackEventMenuItem[];
  /**
   * Optional content rendered inline between the playback control buttons and
   * the playhead time display. Forwarded to {@link TimelineHeader}'s
   * `extraControls`; renders in both the empty-timeline and drawer layouts.
   */
  extraControls?: React.ReactNode;
  /**
   * Optional content rendered inline after the playhead time, preceded by a
   * divider. Forwarded to {@link TimelineHeader}'s `extraActions`; renders in
   * both the empty-timeline and drawer layouts. Readouts belong here — for
   * right-edge buttons use {@link trailingActions}.
   */
  extraActions?: React.ReactNode;
  /**
   * Bring-your-own buttons, pinned to the right edge of the controls row
   * behind their own divider and followed by the drawer chevron. Renders in
   * both the empty-timeline and drawer layouts.
   */
  trailingActions?: React.ReactNode;
  /**
   * Per-row prop override. Returned partial is merged onto the props
   * passed to each {@link TimelineTrack}.
   */
  decorateTrack?: (
    track: Track,
    pinned: boolean,
  ) => Partial<TimelineTrackProps>;
}

/**
 * Full timeline composition.
 *
 * Pinned tracks always render in the TimelineHeader's below-ruler slot, in
 * both drawer states — that's what pinning means, and it keeps them off the
 * drawer's scroll. The drawer body holds only the unpinned tracks, so opening
 * and closing changes exactly one height and animates cleanly.
 */
const TimelineWithTracks: React.FC<TimelineWithTracksProps> = ({
  loaded,
  labelWidth: requestedLabelWidth = TIMELINE_LABEL_WIDTH,
  maxSize = TIMELINE_DRAWER_MAX_SIZE,
  className,
  defaultDrawerOpen = false,
  drawerOpen: controlledDrawerOpen,
  onDrawerOpenChange,
  rulerOverlay,
  eventMenuItems,
  extraControls,
  extraActions,
  trailingActions,
  decorateTrack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracks = useTracks();
  const { pinnedIds, togglePin } = useTrackPinning();
  const { seekSnapped } = usePlayback();
  // Uncontrolled open state, seeded once from `defaultDrawerOpen`.
  // User-initiated collapses/expands persist until the next remount.
  const [uncontrolledDrawerOpen, setUncontrolledDrawerOpen] =
    useState(defaultDrawerOpen);
  const drawerOpen = controlledDrawerOpen ?? uncontrolledDrawerOpen;
  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (controlledDrawerOpen === undefined) {
        setUncontrolledDrawerOpen(open);
      }
      onDrawerOpenChange?.(open);
    },
    [controlledDrawerOpen, onDrawerOpenChange],
  );

  /**
   * User's dragged label-column width, or `null` while it still sits at the
   * caller's default. Kept unclamped so a drag past the current ceiling
   * re-widens on its own once a longer label mounts.
   */
  const [draggedLabelWidth, setDraggedLabelWidth] = useState<number | null>(
    null,
  );
  /**
   * Width the widest *mounted* label needs to render in full — the ceiling
   * for the drag. Measured from the DOM rather than from the label strings so
   * it accounts for the real font, the indent, dot and pin button.
   */
  const [maxLabelWidth, setMaxLabelWidth] = useState(requestedLabelWidth);

  const clampLabelWidth = useCallback(
    (width: number) =>
      Math.round(
        Math.min(
          Math.max(width, requestedLabelWidth),
          Math.max(requestedLabelWidth, maxLabelWidth),
        ),
      ),
    [requestedLabelWidth, maxLabelWidth],
  );

  const resolvedLabelWidth = clampLabelWidth(
    draggedLabelWidth ?? requestedLabelWidth,
  );
  const labelWidth = tracks.length === 0 ? 0 : resolvedLabelWidth;

  // Sub-rows follow their parent's pin state via `parentId` so a partial pin
  // doesn't strand attribute children above unrelated parents — see
  // {@link partitionTracksByPin}.
  const { pinned, unpinned } = useMemo(
    () => partitionTracksByPin(tracks, pinnedIds),
    [tracks, pinnedIds],
  );

  // Widest label across every mounted row. `scrollWidth` reports the full
  // text width even while it's ellipsised, and the chrome (padding, indent,
  // dot, pin button, border) is whatever the column holds beyond the text —
  // a constant as the column resizes, so this never feeds back into itself.
  //
  // Both terms must be border-box to match the `width` we set on the column:
  // `clientWidth` excludes the 1px `border-right`, which left every label a
  // pixel short of fitting and so permanently ellipsised at maximum width.
  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let widest = 0;
    host.querySelectorAll<HTMLElement>("[data-track-label]").forEach((text) => {
      const column = text.closest<HTMLElement>("[data-track-label-column]");
      if (!column) return;
      const chrome =
        column.getBoundingClientRect().width -
        text.getBoundingClientRect().width;
      widest = Math.max(widest, Math.ceil(text.scrollWidth + chrome) + 1);
    });

    setMaxLabelWidth(Math.max(requestedLabelWidth, widest));
  }, [tracks, drawerOpen, pinnedIds, requestedLabelWidth]);

  // Width when the current drag began — `useDragDelta` reports the running
  // delta from pointer-down, not per-move increments.
  const dragStartWidthRef = useRef(resolvedLabelWidth);
  const { isDragging, handleProps } = useDragDelta({
    axis: "horizontal",
    onDragStart: () => {
      dragStartWidthRef.current = resolvedLabelWidth;
    },
    onDelta: (delta) =>
      setDraggedLabelWidth(clampLabelWidth(dragStartWidthRef.current + delta)),
  });

  // Nothing to reveal when every label already fits — hide the affordance
  // rather than offer a drag that can't move.
  const canResizeLabels =
    tracks.length > 0 && maxLabelWidth > requestedLabelWidth;

  const labelResizeHandle = canResizeLabels ? (
    <div
      {...handleProps}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize track label column"
      data-testid="timeline-label-resize"
      className={clsx(styles.labelResizeHandle, {
        [styles.labelResizeHandleActive]: isDragging,
      })}
      style={{ left: labelWidth }}
      // Double-click snaps back to the caller's default width.
      onDoubleClick={() => setDraggedLabelWidth(null)}
    />
  ) : null;

  const renderPinnedTrack = (track: Track) => (
    <TimelineTrack
      key={track.id}
      id={track.id}
      label={track.label}
      color={track.color}
      events={track.events}
      labelWidth={labelWidth}
      pinned
      onPinClick={() => togglePin(track.id)}
      onEventClick={(e) => seekSnapped(e.startSec)}
      eventMenuItems={eventMenuItems}
      {...(decorateTrack ? decorateTrack(track, true) : null)}
    />
  );

  const loadedAttribute = loaded === undefined ? undefined : String(loaded);

  if (tracks.length === 0) {
    return (
      <div
        ref={containerRef}
        className={clsx(styles.root, className)}
        data-timeline-loaded={loadedAttribute}
      >
        <TimelineHeader
          labelWidth={labelWidth}
          zoomRef={containerRef}
          rulerOverlay={rulerOverlay}
          extraControls={extraControls}
          extraActions={extraActions}
          trailingActions={trailingActions}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx(styles.root, className)}
      data-timeline-loaded={loadedAttribute}
    >
      <Drawer
        side="bottom"
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        maxSize={maxSize}
        mode="push"
        header={({ open, toggle }) => (
          <TimelineHeader
            labelWidth={labelWidth}
            zoomRef={containerRef}
            onToggle={toggle}
            expanded={open}
            rulerOverlay={rulerOverlay}
            extraControls={extraControls}
            extraActions={extraActions}
            trailingActions={trailingActions}
          >
            <div className={styles.pinnedOverlayHost}>
              {/* Pinned rows live here in both drawer states. They used to move
                  into the body on open, which meant the header shrank in a
                  single frame while the body animated its height over 200ms —
                  two heights changing on different clocks, which is what made
                  the toggle look janky. Keeping them put means only the body
                  animates, and each row still mounts exactly once. */}
              {pinned.map(renderPinnedTrack)}
              <LoopOverlays labelWidth={labelWidth} />
              <PlayheadLine labelWidth={labelWidth} />
              {/* Second handle so the column stays resizable from the pinned
                  rows when the drawer body is collapsed to nothing. */}
              {labelResizeHandle}
            </div>
          </TimelineHeader>
        )}
      >
        <div className={styles.tracksOuter}>
          <div className={styles.tracksArea}>
            {/* Unpinned rows only — pinned ones stay in the header above so the
                drawer's height is the single thing that changes on toggle. */}
            <div>
              {unpinned.map((track) => {
                const extra = decorateTrack
                  ? decorateTrack(track, false)
                  : null;
                return (
                  <TimelineTrack
                    key={track.id}
                    id={track.id}
                    label={track.label}
                    color={track.color}
                    events={track.events}
                    labelWidth={labelWidth}
                    pinned={false}
                    onPinClick={() => togglePin(track.id)}
                    onEventClick={(e) => seekSnapped(e.startSec)}
                    eventMenuItems={eventMenuItems}
                    {...extra}
                    className={clsx(styles.unpinnedTrack, extra?.className)}
                  />
                );
              })}
            </div>
          </div>
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
          {labelResizeHandle}
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
