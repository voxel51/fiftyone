import type { SampleRendererProps } from "@fiftyone/plugins";
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
  useEpisodeTimeRange,
} from "../extensions/episode-intervals";
import { temporalTagIntervalSource } from "./temporal-tag-interval-source";
import styles from "./grid-overlay.module.css";

/** Cap the stacked levels so the lane stays compact on a small grid tile. */
const MAX_LEVELS = 3;

/**
 * Mark thickness and the vertical pitch between stacked levels.
 *
 * The height is applied inline rather than in the stylesheet because the lane's
 * own height is computed from it; two copies would drift.
 */
const MARK_HEIGHT = 6;
const LEVEL_STEP = 8;

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
 * means reaching one element up and out of this package; the grid's own test
 * hook is the stable handle it offers for exactly this element.
 */
const TILE_SELECTOR = "[data-cy='grid-custom-renderer']";

/**
 * Tile sizes the lane stops being worth its space at.
 *
 * The bar is fixed height, so on a small enough tile it stops being a readout
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
export function EpisodeGridOverlay({ ctx }: SampleRendererProps) {
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
  readonly ctx: SampleRendererProps["ctx"];
  readonly resolved: readonly ResolvedEpisodeIntervals[];
}) {
  const episodeId = ctx.sample.sample._id;
  const timeRange = useEpisodeTimeRange(episodeId);
  const playheadNs = useEpisodePlayheadNs(episodeId, timeRange);
  const recordingDurationNs = timeRange
    ? Number(timeRange.endNs - timeRange.startNs)
    : undefined;

  const model = useMemo(
    () => buildLaneModel(resolved, recordingDurationNs),
    [recordingDurationNs, resolved],
  );

  // Where the pointer is over the overlay, as a position on the lane's axis in
  // episode-relative ns; null whenever the pointer is elsewhere on the tile. It
  // takes precedence over the playhead for the readout: it is a deliberate act
  // of inspection, while the playhead is only where the tile got to.
  const [hoverNs, setHoverNs] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [tile, setTile] = useState<HTMLElement | null>(null);
  const attachToTile = useCallback((sentinel: HTMLElement | null) => {
    setTile(sentinel?.closest<HTMLElement>(TILE_SELECTOR) ?? null);
  }, []);
  const tileSize = useElementSize(tile);

  const domainSpan = model?.domainSpan ?? 1;
  const hitToleranceNs = domainSpan * HIT_TOLERANCE;
  // Read through a ref so a changing span never re-subscribes the listener.
  const domainSpanRef = useRef(domainSpan);
  domainSpanRef.current = domainSpan;

  // This effect follows the pointer while it is over the overlay, projected
  // onto the lane's horizontal axis. Listening on the tile rather than on the
  // overlay is what lets the overlay stay `pointer-events: none`, so arriving
  // over an interval does not cut hover playback off. The bar's own rectangle is
  // then what decides whether the pointer counts as being over it — hovering
  // the preview itself is not an inspection and gets no ghost.
  useEffect(() => {
    if (!tile) return;

    const onMove = (event: globalThis.MouseEvent) => {
      const bar = barRef.current;
      const lane = laneRef.current;
      if (!bar || !lane) return;

      const overlay = bar.getBoundingClientRect();
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

  // The sentinel is how the tile is found, so it is rendered unconditionally:
  // gating the bar on a measurement taken through it would mean never taking
  // the measurement.
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

  const { intervals, marks, levelCount } = model;
  const readoutNs = hoverNs ?? playheadNs;

  return (
    <div className={styles.bar} data-testid="episode-grid-overlay" ref={barRef}>
      {sentinel}
      {fitsReadout && (
        <Readout
          intervals={intervals}
          timeNs={readoutNs}
          toleranceNs={hitToleranceNs}
          width={tileSize?.width ?? 0}
        />
      )}
      <div
        className={styles.lane}
        ref={laneRef}
        style={{ height: (levelCount - 1) * LEVEL_STEP + MARK_HEIGHT }}
      >
        {/* One track per occupied level, so an empty stretch reads as somewhere
            an interval could sit rather than as bare background. */}
        {Array.from({ length: levelCount }, (_, level) => (
          <div
            className={styles.track}
            key={level}
            style={{ bottom: level * LEVEL_STEP, height: MARK_HEIGHT }}
          />
        ))}
        {marks.map((mark, index) => (
          <div
            key={index}
            className={styles.mark}
            data-source={mark.interval.sourceId}
            data-testid="episode-grid-overlay-mark"
            style={{
              left: `${offsetPercent(mark.interval.startNs, domainSpan)}%`,
              width: `${
                ((mark.interval.endNs - mark.interval.startNs) / domainSpan) *
                100
              }%`,
              bottom: mark.level * LEVEL_STEP,
              height: MARK_HEIGHT,
              background: mark.interval.color,
            }}
          />
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

  useEffect(() => {
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

interface LaneMark {
  readonly interval: EpisodeInterval;
  readonly level: number;
}

interface LaneModel {
  /** Only the intervals that found a level; these are what get drawn. */
  readonly marks: readonly LaneMark[];
  /**
   * Every interval, placed or not. The readout works from this, so an interval
   * the lane had no room to draw is still named when the pointer reaches it —
   * dropping it from the lane loses its position, not its existence.
   */
  readonly intervals: readonly EpisodeInterval[];
  readonly levelCount: number;
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

  return {
    marks: intervals.flatMap((interval, index) =>
      levels[index] === UNPLACED ? [] : [{ interval, level: levels[index] }],
    ),
    intervals,
    levelCount,
    domainSpan: Math.max(recordingDurationNs ?? fallbackEnd, 1),
  };
}

export default EpisodeGridOverlay;
