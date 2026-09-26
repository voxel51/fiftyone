import type { IntervalTileContext } from "../extensions/episode-intervals";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EpisodeInterval,
  ResolvedEpisodeIntervals,
} from "../extensions/episode-intervals";
import {
  EpisodeIntervalSources,
  packIntervals,
  UNPLACED,
  useEpisodePlayheadNs,
  useEpisodeSeek,
  useEpisodeTimeRange,
} from "../extensions/episode-intervals";
import { temporalTagIntervalSource } from "./temporal-tag-interval-source";
import styles from "./grid-overlay.module.css";

/** Cap the stacked levels so the lane stays compact on a small grid tile. */
const MAX_LEVELS = 3;

/**
 * Fraction of the lane's span an instant still answers a hover from.
 *
 * A zero-width interval covers exactly one nanosecond, which a pointer will
 * never land on, so without some tolerance an instant could never be read.
 */
const HIT_TOLERANCE = 0.005;

/**
 * The grid tile this overlay sits in.
 *
 * The pointer is tracked on the tile rather than on the lane, so that moving
 * onto an interval — or onto the readout above it — neither takes the pointer
 * off the cell (which would stop hover playback) nor ends the readout. That
 * means reaching one element up and out of this package, through the attribute
 * the grid publishes for exactly this purpose.
 */
const TILE_SELECTOR = "[data-grid-tile]";

/**
 * Tile sizes the lane stops being worth its space at.
 *
 * The overlay is fixed height, so on a small tile it stops being a readout
 * and starts being a stripe across the preview. Below the readout thresholds
 * the names go and the lane stays, which is the half that still reads at a
 * glance; below the lane thresholds the overlay goes entirely.
 *
 * Chosen by eye at the grid's zoom extremes rather than derived from anything —
 * worth re-tuning against a real dataset.
 */
const MIN_LANE_TILE_WIDTH = 96;
const MIN_LANE_TILE_HEIGHT = 72;
const MIN_READOUT_TILE_WIDTH = 150;
const MIN_READOUT_TILE_HEIGHT = 132;

/**
 * Most names the readout will ever lay out.
 *
 * The fit is found by dropping one name at a time, so this bounds that walk. A
 * moment with more than this many things happening at once cannot usefully be
 * listed on one line anyway; the overflow count says how many there were.
 */
const MAX_READOUT_NAMES = 12;

/**
 * Sources that ship in this package. Everything else arrives through the
 * registry — see `extensions/episode-intervals/types.ts`.
 */
const BUILT_IN_SOURCES = [temporalTagIntervalSource];

/**
 * Bottom-of-tile interval lane for multimodal grid previews.
 *
 * Every enabled source's intervals flatten into one shared, packed lane: one
 * `packIntervals` call over the whole flattened list, so intervals from
 * different sources share levels and enabling another source never makes the
 * tile taller. Renders nothing when no source contributes anything.
 */
export function EpisodeGridOverlay({ ctx }: { ctx: IntervalTileContext }) {
  return (
    <EpisodeIntervalSources builtInSources={BUILT_IN_SOURCES} ctx={ctx}>
      {(resolved) => <IntervalLane ctx={ctx} resolved={resolved} />}
    </EpisodeIntervalSources>
  );
}

function IntervalLane({
  ctx,
  resolved,
}: {
  readonly ctx: IntervalTileContext;
  readonly resolved: readonly ResolvedEpisodeIntervals[];
}) {
  const episodeId = ctx.sample.sample._id;
  const timeRange = useEpisodeTimeRange(episodeId);
  const playheadNs = useEpisodePlayheadNs(episodeId, timeRange);
  const recordingDurationNs = timeRange
    ? Number(timeRange.endNs - timeRange.startNs)
    : ctx.durationNs;

  const model = useMemo(
    () => buildLaneModel(resolved, recordingDurationNs),
    [recordingDurationNs, resolved],
  );

  // Where the pointer is over the overlay, as a position on the lane's axis in
  // episode-relative ns; null whenever the pointer is elsewhere on the tile. It
  // takes precedence over the playhead for the readout: it is a deliberate act
  // of inspection, while the playhead is only where the tile got to.
  const [hoverNs, setHoverNs] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const seek = useEpisodeSeek(episodeId, timeRange);
  const [tile, setTile] = useState<HTMLElement | null>(null);
  const attachToTile = useCallback((sentinel: HTMLElement | null) => {
    setTile(sentinel?.closest<HTMLElement>(TILE_SELECTOR) ?? null);
  }, []);
  const tileSize = useElementSize(tile);

  const domainSpan = model?.domainSpan ?? 1;
  const hitToleranceNs = domainSpan * HIT_TOLERANCE;
  // Read through a ref so a changing span never re-subscribes the listener.
  //
  // Written after commit rather than during render: the listeners below are
  // bound to the committed tile, so a render that is thrown away — or one
  // React has not committed yet — must not be able to move the value they
  // read. A click can only arrive after commit, so the ref is never stale by
  // the time either listener fires.
  const domainSpanRef = useRef(domainSpan);
  useLayoutEffect(() => {
    domainSpanRef.current = domainSpan;
  }, [domainSpan]);

  // This effect follows the pointer while it is over the overlay, projected
  // onto the lane's horizontal axis. Listening on the tile rather than on the
  // overlay is what lets the overlay stay `pointer-events: none`, so arriving
  // over an interval does not cut hover playback off. The container's own
  // rectangle is then what decides whether the pointer counts as being over
  // it — hovering the preview itself is not an inspection and gets no ghost.
  useEffect(() => {
    if (!tile) return;

    const onMove = (event: globalThis.MouseEvent) => {
      const container = containerRef.current;
      const lane = laneRef.current;
      if (!container || !lane) return;

      const overlay = container.getBoundingClientRect();
      if (
        event.clientX < overlay.left ||
        event.clientX > overlay.right ||
        event.clientY < overlay.top ||
        event.clientY > overlay.bottom
      ) {
        setHoverNs(null);
        return;
      }

      const { left, width } = lane.getBoundingClientRect();
      if (width <= 0) return;
      const fraction = clamp((event.clientX - left) / width, 0, 1);
      setHoverNs(fraction * domainSpanRef.current);
    };
    const onLeave = () => setHoverNs(null);

    tile.addEventListener("mousemove", onMove);
    tile.addEventListener("mouseleave", onLeave);
    return () => {
      tile.removeEventListener("mousemove", onMove);
      tile.removeEventListener("mouseleave", onLeave);
    };
  }, [tile]);

  // Read through a ref for the same reason the span is: the listener below is
  // bound once per tile and must not re-subscribe as the episode's range
  // arrives or the tile is pointed at another sample.
  const seekRef = useRef(seek);
  useLayoutEffect(() => {
    seekRef.current = seek;
  }, [seek]);

  // This effect turns a click on the overlay into a seek instead of letting it
  // open the modal.
  //
  // Bound on the tile in the CAPTURE phase, which is the only place it can be:
  // the overlay is `pointer-events: none` — deliberately, so that reaching for
  // it does not cut hover playback off — so the click's target is the preview
  // underneath it, and by the time the event bubbles it is indistinguishable
  // from a click on the tile. Capturing lets its own rectangle decide,
  // exactly as it does for the hover readout, and stop the event before the
  // grid cell that would open the sample ever sees it.
  useEffect(() => {
    if (!tile) return undefined;

    const onClick = (event: globalThis.MouseEvent) => {
      // A modified click is the grid's, not ours: those are how a tile is
      // added to a selection.
      if (event.metaKey || event.shiftKey || event.ctrlKey || event.altKey) {
        return;
      }

      const container = containerRef.current;
      const lane = laneRef.current;
      const requestSeek = seekRef.current;
      if (!container || !lane || !requestSeek) return;

      const overlay = container.getBoundingClientRect();
      if (
        event.clientX < overlay.left ||
        event.clientX > overlay.right ||
        event.clientY < overlay.top ||
        event.clientY > overlay.bottom
      ) {
        return;
      }

      const { left, width } = lane.getBoundingClientRect();
      if (width <= 0) return;

      event.preventDefault();
      event.stopPropagation();
      requestSeek(
        clamp((event.clientX - left) / width, 0, 1) * domainSpanRef.current,
      );
    };

    tile.addEventListener("click", onClick, { capture: true });
    return () => tile.removeEventListener("click", onClick, { capture: true });
  }, [tile]);

  // The sentinel is how the tile is found, so it is rendered unconditionally:
  // gating the overlay on a measurement taken through it would mean never
  // taking the measurement.
  const sentinel = <span hidden ref={attachToTile} />;

  if (!model) return sentinel;

  // A tile that has not been measured yet is "unknown", not "tiny" — the grid
  // mounts tiles before laying them out, and reading that as too small would
  // flash the overlay away on mount.
  const fitsLane =
    tileSize === null ||
    (tileSize.width >= MIN_LANE_TILE_WIDTH &&
      tileSize.height >= MIN_LANE_TILE_HEIGHT);
  if (!fitsLane) return sentinel;

  const fitsReadout =
    tileSize === null ||
    (tileSize.width >= MIN_READOUT_TILE_WIDTH &&
      tileSize.height >= MIN_READOUT_TILE_HEIGHT);

  const { intervals, levels } = model;
  const readoutNs = hoverNs ?? playheadNs;

  return (
    <div
      className={styles.overlayContainer}
      data-testid="episode-grid-overlay"
      ref={containerRef}
    >
      {sentinel}
      {fitsReadout && (
        <Readout
          intervals={intervals}
          timeNs={readoutNs}
          toleranceNs={hitToleranceNs}
          width={tileSize?.width ?? 0}
        />
      )}
      <div className={styles.lane} ref={laneRef}>
        {/* One track per occupied level, so an empty stretch reads as somewhere
            an interval could sit rather than as bare background. Highest level
            first, so level 0 is the bottom row it was packed onto. */}
        {levels.map((placed, index) => (
          <div className={styles.track} key={levels.length - 1 - index}>
            {placed.map((interval, markIndex) => (
              <div
                key={markIndex}
                className={styles.mark}
                data-source={interval.sourceId}
                data-testid="episode-grid-overlay-mark"
                style={{
                  left: `${offsetPercent(interval.startNs, domainSpan)}%`,
                  width: `${spanPercent(
                    interval.startNs,
                    interval.endNs,
                    domainSpan,
                  )}%`,
                  background: interval.color,
                }}
              />
            ))}
          </div>
        ))}
        {playheadNs !== null && (
          <div
            className={styles.playhead}
            data-testid="episode-grid-overlay-playhead"
            style={{ left: `${offsetPercent(playheadNs, domainSpan)}%` }}
          />
        )}
        {hoverNs !== null && (
          <div
            className={styles.ghost}
            data-testid="episode-grid-overlay-ghost"
            style={{ left: `${offsetPercent(hoverNs, domainSpan)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * An element's content box, remeasured as it changes.
 *
 * Null until the first measurement, which callers must read as "not known yet"
 * rather than "too small" — the grid mounts tiles before laying them out, and
 * treating an unmeasured tile as tiny would flash the overlay away on mount.
 *
 * State is only replaced when a dimension actually changes, so a drag-resize
 * settles instead of re-rendering on every observer callback.
 */
function useElementSize(
  element: HTMLElement | null,
): { readonly width: number; readonly height: number } | null {
  const [size, setSize] = useState<{
    readonly width: number;
    readonly height: number;
  } | null>(null);

  // Layout effect, not a passive one: an unmeasured tile is treated as "fits"
  // below, so measuring after paint would let the lane paint one frame on a
  // tile it is about to be pulled off.
  useLayoutEffect(() => {
    if (!element) {
      setSize(null);
      return;
    }

    const commit = (width: number, height: number) => {
      setSize((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    const rect = element.getBoundingClientRect();
    commit(rect.width, rect.height);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) commit(box.width, box.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function offsetPercent(timeNs: number, domainSpan: number): number {
  return clamp((timeNs / domainSpan) * 100, 0, 100);
}

/**
 * The part of an interval that falls on the axis, as a width.
 *
 * Sources rebase their own spans and are not required to have taken them from
 * the same clock the playback plan did, so an interval can start before the
 * published range or run past its end. Clamping both ends — rather than
 * clamping `left` alone and taking the raw span as the width — keeps such an
 * interval inside the lane it is drawn in.
 */
function spanPercent(
  startNs: number,
  endNs: number,
  domainSpan: number,
): number {
  return offsetPercent(endNs, domainSpan) - offsetPercent(startNs, domainSpan);
}

/**
 * The one-line "what is happening here" row, truncated to a "+N more" count
 * when the names do not fit the tile's width.
 *
 * The fit is measured rather than estimated: chip widths depend on the name
 * text and the tile is resizable, so any character budget would be wrong at
 * some zoom level. Measuring means dropping one name at a time until the row
 * stops overflowing, which settles in a few layout passes, all before paint.
 *
 * The limit is reset by the *names*, not by the array holding them. The
 * covering set is recomputed on every pointer move, so keying the reset on
 * identity would undo the shrink on each render and the two effects would
 * fight each other forever.
 */
function Readout({
  intervals: all,
  timeNs,
  toleranceNs,
  width,
}: {
  readonly intervals: readonly EpisodeInterval[];
  readonly timeNs: number | null;
  readonly toleranceNs: number;
  /** The tile's width; a change to it is a change to what fits. */
  readonly width: number;
}) {
  const intervals = useMemo(
    () => intervalsAt(all, timeNs, toleranceNs).slice(0, MAX_READOUT_NAMES),
    [all, timeNs, toleranceNs],
  );
  const names = intervals.map(readoutKey).join("\u0000");
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [limit, setLimit] = useState(intervals.length);

  // Start again from "everything fits" when the names change or the tile is
  // resized, so the count grows back at a sparser moment or a wider tile as
  // well as shrinking at a busier one.
  useLayoutEffect(() => {
    setLimit(countOf(names));
  }, [names, width]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || limit === 0) return;
    // A row with no width yet is mid-layout, not overflowing; measuring it
    // would drop every name and never restore them.
    if (row.clientWidth === 0) return;
    // A pixel of slack absorbs sub-pixel layout rounding, which would
    // otherwise read as a permanent overflow.
    if (row.scrollWidth > row.clientWidth + 1) {
      setLimit((count) => count - 1);
    }
    // Depends on all three so it converges and then stops: each decrement
    // re-runs it, and new names or a new width re-measure even when the count
    // is unchanged.
  }, [limit, names, width]);

  if (intervals.length === 0) return null;

  const shown = intervals.slice(0, limit);
  const hidden = intervals.length - shown.length;

  return (
    <div
      className={styles.readout}
      data-testid="episode-grid-overlay-readout"
      ref={rowRef}
    >
      {shown.map((interval) => (
        <span className={styles.chip} key={readoutKey(interval)}>
          <span className={styles.dot} style={{ background: interval.color }} />
          {interval.eventName}
        </span>
      ))}
      {hidden > 0 && (
        <span className={styles.overflow}>{`+${hidden} more`}</span>
      )}
    </div>
  );
}

/** Identity of one readout entry: the source that owns it and its name. */
function readoutKey(interval: EpisodeInterval): string {
  return `${interval.sourceId} ${interval.eventName}`;
}

/** How many names the joined key holds; empty means none, not one. */
function countOf(names: string): number {
  return names === "" ? 0 : names.split("\u0000").length;
}

const NO_INTERVALS: readonly EpisodeInterval[] = [];

/**
 * The distinct intervals covering one instant, in contribution order.
 *
 * Deduplicated by source and name: two occurrences of the same tag that happen
 * to overlap are one thing as far as the reader is concerned, and listing it
 * twice would spend the row's limited width saying so.
 */
function intervalsAt(
  intervals: readonly EpisodeInterval[],
  timeNs: number | null,
  toleranceNs: number,
): readonly EpisodeInterval[] {
  if (timeNs === null) return NO_INTERVALS;

  const seen = new Set<string>();
  const covering: EpisodeInterval[] = [];
  for (const interval of intervals) {
    if (
      interval.startNs - toleranceNs > timeNs ||
      interval.endNs + toleranceNs < timeNs
    ) {
      continue;
    }
    const key = `${interval.sourceId} ${interval.eventName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    covering.push(interval);
  }
  return covering;
}

interface LaneModel {
  /**
   * The intervals that found a level, grouped into the track each one is
   * drawn on. Ordered top row first — the highest level packed — so the list
   * maps straight onto the column of tracks.
   */
  readonly levels: readonly (readonly EpisodeInterval[])[];
  /**
   * Every interval, placed or not. The readout works from this, so an interval
   * the lane had no room to draw is still named when the pointer reaches it —
   * dropping it from the lane loses its position, not its existence.
   */
  readonly intervals: readonly EpisodeInterval[];
  /** Time span the lane maps left->right (ns); never zero. */
  readonly domainSpan: number;
}

/**
 * Flattens every source's intervals into one packed lane. The time axis runs
 * from 0 (recording start) to the recording end; before the active format has
 * published an episode time range, the widest extent any source reported is
 * used instead.
 */
function buildLaneModel(
  resolved: readonly ResolvedEpisodeIntervals[],
  recordingDurationNs?: number,
): LaneModel | null {
  const intervals: EpisodeInterval[] = [];
  let fallbackEnd = 0;
  for (const { contribution } of resolved) {
    if (contribution.domainEndNs && contribution.domainEndNs > fallbackEnd) {
      fallbackEnd = contribution.domainEndNs;
    }
    for (const interval of contribution.intervals) {
      if (interval.endNs > fallbackEnd) fallbackEnd = interval.endNs;
      intervals.push(interval);
    }
  }
  if (intervals.length === 0) return null;

  const { levels, levelCount } = packIntervals(
    intervals.map(({ startNs, endNs }) => ({ start: startNs, end: endNs })),
    MAX_LEVELS,
  );

  // Top row first: level 0 is the base of the stack and so the last track in
  // a column that grows downwards.
  const tracks: EpisodeInterval[][] = Array.from(
    { length: levelCount },
    () => [],
  );
  intervals.forEach((interval, index) => {
    const level = levels[index];
    if (level === UNPLACED) return;
    tracks[levelCount - 1 - level].push(interval);
  });

  return {
    levels: tracks,
    intervals,
    domainSpan: Math.max(recordingDurationNs ?? fallbackEnd, 1),
  };
}

export default EpisodeGridOverlay;
