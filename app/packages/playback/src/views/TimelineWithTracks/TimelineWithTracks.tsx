import { Drawer, useDragDelta } from "@voxel51/voodo";
import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  TIMELINE_DRAWER_MAX_SIZE,
  TIMELINE_LABEL_WIDTH,
  TIMELINE_TRACK_OVERSCAN_PX,
  TIMELINE_TRACK_ROW_HEIGHT,
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

/**
 * Imperative handle onto the tracks list. The drawer body is virtualized, so a
 * row that isn't on screen has no DOM node to `scrollIntoView` — callers that
 * need to reveal a track (e.g. following the annotation engine's editing
 * anchor) must go through here instead of querying `[data-track-id]`.
 */
export interface TimelineTracksScroller {
  /**
   * Scroll the row for `trackId` into view. No-op for an unknown id, and for a
   * pinned row it falls through to the DOM — pinned rows always render.
   */
  scrollToTrack: (trackId: string) => void;
}

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
   *
   * Called only for the rows the virtualizer currently has mounted, so it may
   * run again for the same track on scroll — keep it cheap and side-effect
   * free.
   */
  decorateTrack?: (
    track: Track,
    pinned: boolean,
  ) => Partial<TimelineTrackProps>;
  /**
   * Filled with a {@link TimelineTracksScroller} while mounted. Pass a ref
   * here to reveal a track programmatically; virtualized rows can't be reached
   * through the DOM.
   */
  scrollerRef?: React.MutableRefObject<TimelineTracksScroller | null>;
}

/**
 * Full timeline composition.
 *
 * Pinned tracks always render in the TimelineHeader's below-ruler slot, in
 * both drawer states — that's what pinning means, and it keeps them off the
 * drawer's scroll. The drawer body holds only the unpinned tracks, so opening
 * and closing changes exactly one height and animates cleanly.
 *
 * The drawer body is virtualized (react-virtuoso): only the rows in view plus
 * an overscan margin are mounted, so a timeline with hundreds of tracks costs
 * the same as one with a dozen. That covers sub-rows too — callers flatten a
 * parent track and its children into one list (see `partitionTracksByPin`),
 * so children are ordinary rows here, not a nested list that would render
 * eagerly once its group scrolled in. Pinned rows are deliberately NOT
 * virtualized: they live in the header, which has no bounded height to
 * virtualize against, and the whole point of pinning is that it's a short,
 * user-curated list.
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
  scrollerRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
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

  /**
   * Index range the virtualizer currently has mounted, as a `start:end` key.
   * Only a change in the range re-triggers the label measurement below —
   * publishing the raw callback on every scroll frame would spin.
   */
  const [renderedRange, setRenderedRange] = useState("");
  const handleRangeChanged = useCallback(
    ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
      const key = `${startIndex}:${endIndex}`;
      setRenderedRange((prev) => (prev === key ? prev : key));
    },
    [],
  );

  /**
   * Inputs the current {@link maxLabelWidth} was measured against. A change
   * means the row set itself changed, so the accumulated ceiling is stale and
   * the next measurement starts from scratch instead of merging.
   */
  const measuredAgainstRef = useRef<unknown[]>([]);

  // Widest label across every mounted row. `scrollWidth` reports the full
  // text width even while it's ellipsised, and the chrome (padding, indent,
  // dot, pin button, border) is whatever the column holds beyond the text —
  // a constant as the column resizes, so this never feeds back into itself.
  //
  // Both terms must be border-box to match the `width` we set on the column:
  // `clientWidth` excludes the 1px `border-right`, which left every label a
  // pixel short of fitting and so permanently ellipsised at maximum width.
  //
  // Virtualization means "every mounted row" is only the visible window, so
  // the ceiling is accumulated: it takes the running maximum as more rows
  // scroll into view, and resets when the row set changes. A label that has
  // never been on screen therefore can't widen the column yet — measuring it
  // would mean mounting every row, which is exactly what we're avoiding.
  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const inputs = [tracks, drawerOpen, pinnedIds, requestedLabelWidth];
    const sameRows =
      measuredAgainstRef.current.length === inputs.length &&
      measuredAgainstRef.current.every((value, i) => value === inputs[i]);
    measuredAgainstRef.current = inputs;

    let widest = 0;
    host.querySelectorAll<HTMLElement>("[data-track-label]").forEach((text) => {
      const column = text.closest<HTMLElement>("[data-track-label-column]");
      if (!column) return;
      const chrome =
        column.getBoundingClientRect().width -
        text.getBoundingClientRect().width;
      widest = Math.max(widest, Math.ceil(text.scrollWidth + chrome) + 1);
    });

    setMaxLabelWidth((prev) =>
      Math.max(requestedLabelWidth, widest, sameRows ? prev : 0),
    );
  }, [tracks, drawerOpen, pinnedIds, requestedLabelWidth, renderedRange]);

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

  const renderUnpinnedTrack = (track: Track) => {
    const extra = decorateTrack ? decorateTrack(track, false) : null;
    return (
      <TimelineTrack
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
  };

  /**
   * Total height of the unpinned list as the virtualizer measures it. The
   * drawer auto-sizes to `min(content height, maxSize)` by reading its
   * content's `offsetHeight`, and a virtualized list's DOM height is the
   * window it renders, not the list — so we set the height explicitly from
   * this instead. `0` until the first rows commit; the uniform-row estimate
   * covers that gap (and any rows the virtualizer hasn't measured), so the
   * drawer opens at roughly the right size and settles on the exact one.
   */
  const [measuredListHeight, setMeasuredListHeight] = useState(0);
  const estimatedListHeight = unpinned.length * TIMELINE_TRACK_ROW_HEIGHT;
  const tracksBodyHeight = Math.min(
    measuredListHeight || estimatedListHeight,
    maxSize,
  );

  // Publish the imperative scroll seam. Rebuilt whenever the unpinned order
  // changes, since a track's index in that list is what the virtualizer takes.
  useEffect(() => {
    if (!scrollerRef) return undefined;

    scrollerRef.current = {
      scrollToTrack: (trackId: string) => {
        const index = unpinned.findIndex((track) => track.id === trackId);
        if (index >= 0) {
          // No `align`: Virtuoso's default view calculation is "nearest" —
          // it leaves an already-visible row alone and otherwise scrolls it to
          // whichever edge it came in from.
          virtuosoRef.current?.scrollIntoView({ index, behavior: "smooth" });
          return;
        }

        // Not in the virtualized body — a pinned row (or a sub-row of one),
        // which always renders, so the DOM can answer for it.
        containerRef.current
          ?.querySelector(`[data-track-id="${CSS.escape(trackId)}"]`)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
      },
    };

    return () => {
      scrollerRef.current = null;
    };
  }, [scrollerRef, unpinned]);

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
        <div className={styles.tracksOuter} style={{ height: tracksBodyHeight }}>
          {/* Unpinned rows only — pinned ones stay in the header above so the
              drawer's height is the single thing that changes on toggle.
              Virtualized: this list is every track the user hasn't pinned,
              which on the annotation surface is *all* of them (nothing
              auto-pins there), and each row paints a full lane of event bars.
              Sub-rows arrive already flattened into the same list, so a track
              group's children virtualize exactly like its parent — there is no
              separate group-level list that renders its children eagerly. */}
          <Virtuoso
            ref={virtuosoRef}
            className={styles.tracksArea}
            data={unpinned}
            computeItemKey={(_, track) => track.id}
            defaultItemHeight={TIMELINE_TRACK_ROW_HEIGHT}
            increaseViewportBy={TIMELINE_TRACK_OVERSCAN_PX}
            totalListHeightChanged={setMeasuredListHeight}
            rangeChanged={handleRangeChanged}
            itemContent={(_, track) => renderUnpinnedTrack(track)}
          />
          <LoopOverlays labelWidth={labelWidth} />
          <PlayheadLine labelWidth={labelWidth} />
          {labelResizeHandle}
        </div>
      </Drawer>
    </div>
  );
};

export default TimelineWithTracks;
