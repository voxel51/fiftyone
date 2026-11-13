import uPlot from "uplot";
import { PLOT_SERIES_PALETTE } from "./series-palette";

/**
 * State lanes draw text-valued series (gear, drive mode, road condition) as
 * horizontal bands of labeled segments on the timeseries chart's shared time
 * axis. Each value holds until the series' next sample; NaN gaps break the
 * lane. Lanes sit below any numeric lines, which keep the rest of the plot.
 */

/** Lane height beside numeric lines; standalone lanes may grow taller. */
const LANE_HEIGHT_PX = 20;
const MAX_STANDALONE_LANE_HEIGHT_PX = 32;
const MIN_LANE_HEIGHT_PX = 8;
const LANE_GAP_PX = 4;

/** Lane names in the y-axis gutter stay readable without starving the plot. */
const MAX_LANE_NAME_WIDTH_PX = 140;

const SEGMENT_LABEL_INSET_PX = 4;
const MIN_LABELED_SEGMENT_PX = 18;
/** Narrower segments (blinks, brief faults) draw as solid ticks, unedged. */
const MIN_EDGED_SEGMENT_PX = 4;
const SEGMENT_FILL_ALPHA = 0.55;
const SEGMENT_ACCENT_PX = 2;
const SERIES_MARKER_PX = 3;
const LANE_TRACK_FILL = "rgba(255, 255, 255, 0.04)";
const TRANSITION_STROKE = "rgba(5, 11, 18, 0.9)";
const SEGMENT_TEXT = "#f4f3ef";

/** One state series as drawn: its data column, identity, and labels. */
export interface StateLane {
  readonly color: string;
  /** Index into the chart's aligned data. */
  readonly column: number;
  readonly labels: readonly string[];
  readonly name: string;
}

/** Lane placement within the plot area, in CSS pixels. */
export interface StateLaneLayout {
  readonly laneHeightPx: number;
  /** Lane tops measured from the plot-area top, in series order. */
  readonly laneTopsPx: readonly number[];
  /** Plot-area height numeric lines must leave free at the bottom. */
  readonly reservedPx: number;
}

/** A held state between two times, in chart x units (seconds). */
export interface StateSegment {
  readonly code: number;
  readonly endSec: number;
  readonly startSec: number;
}

/**
 * Places lanes in the plot area. Beside numeric lines they form a band of
 * fixed-height rows along the bottom, at most half the plot; alone they
 * stack from the top and grow to a comfortable reading height.
 */
export function stateLaneLayout(
  plotHeightPx: number,
  laneCount: number,
  withLines: boolean,
): StateLaneLayout {
  if (laneCount === 0) {
    return { laneHeightPx: 0, laneTopsPx: [], reservedPx: 0 };
  }
  const available = withLines ? plotHeightPx / 2 : plotHeightPx;
  const laneHeightPx = Math.max(
    MIN_LANE_HEIGHT_PX,
    Math.min(
      withLines ? LANE_HEIGHT_PX : MAX_STANDALONE_LANE_HEIGHT_PX,
      Math.floor(available / laneCount) - LANE_GAP_PX,
    ),
  );
  const pitch = laneHeightPx + LANE_GAP_PX;
  const bandPx = laneCount * pitch;
  const firstTop = withLines ? plotHeightPx - bandPx : LANE_GAP_PX;
  return {
    laneHeightPx,
    laneTopsPx: Array.from(
      { length: laneCount },
      (_, index) => firstTop + index * pitch,
    ),
    reservedPx: withLines ? bandPx + LANE_GAP_PX : 0,
  };
}

/**
 * Extends a numeric y range downward so values occupy only the plot height
 * above a reserved lane band.
 */
export function reserveStateLaneBand(
  range: readonly [number, number],
  plotHeightPx: number,
  reservedPx: number,
): readonly [number, number] {
  const linePx = plotHeightPx - reservedPx;
  if (reservedPx <= 0 || linePx <= 0) return range;
  const [min, max] = range;
  return [min - ((max - min) * reservedPx) / linePx, max];
}

/**
 * Sample-and-hold segments for one series of joined chart data. `undefined`
 * entries are alignment-only positions of other series and are skipped;
 * `null` or non-finite entries end the held state. Consecutive samples of
 * one state merge, so segment starts are exactly the transitions. The last
 * state holds to `holdEndSec(lastSampleSec)`.
 */
export function stateSegments(
  xs: ArrayLike<number>,
  column: ArrayLike<number | null | undefined>,
  holdEndSec: (lastSampleSec: number) => number,
): StateSegment[] {
  const segments: StateSegment[] = [];
  let open: { readonly code: number; readonly startSec: number } | undefined;
  let lastSampleSec = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const value = column[index];
    if (value === undefined) continue;
    const sec = xs[index];
    if (value === null || !Number.isFinite(value)) {
      if (open) segments.push({ ...open, endSec: sec });
      open = undefined;
      continue;
    }
    lastSampleSec = sec;
    if (open?.code === value) continue;
    if (open) segments.push({ ...open, endSec: sec });
    open = { code: value, startSec: sec };
  }
  if (open) {
    segments.push({
      ...open,
      endSec: Math.max(lastSampleSec, holdEndSec(lastSampleSec)),
    });
  }
  return segments;
}

/**
 * Per joined column, the index of the nearest real sample at or before each
 * position (-1 before the first). Built once per data update, so legend
 * reads at playback cadence stay O(1) even for a sparse state topic joined
 * with dense numeric series.
 */
const heldIndexesByColumn = new WeakMap<object, Int32Array>();

/**
 * The state held at `index` of joined chart data: the nearest real sample at
 * or before it, or null inside a gap or before the first sample.
 */
export function heldStateCode(
  column: ArrayLike<number | null | undefined> & object,
  index: number,
): number | null {
  let heldIndexes = heldIndexesByColumn.get(column);
  if (!heldIndexes) {
    heldIndexes = new Int32Array(column.length);
    let last = -1;
    for (let cursor = 0; cursor < column.length; cursor += 1) {
      if (column[cursor] !== undefined) last = cursor;
      heldIndexes[cursor] = last;
    }
    heldIndexesByColumn.set(column, heldIndexes);
  }
  const held = heldIndexes[index] ?? -1;
  if (held < 0) return null;
  const value = column[held];
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : value;
}

/** Fill color for one state code; codes are stable per series. */
function stateColor(code: number): string {
  return PLOT_SERIES_PALETTE[code % PLOT_SERIES_PALETTE.length];
}

/**
 * Draws every lane onto the chart canvas: a faint track, one filled segment
 * per held state with a dark transition edge, its label pinned to the
 * visible start of the segment, a series-color marker at the lane's left
 * edge, and the lane name right-aligned in the y-axis gutter. Segments too
 * narrow for an edge draw as solid ticks so brief states stay visible.
 */
export function drawStateLanes(
  chart: uPlot,
  lanes: readonly StateLane[],
  layout: StateLaneLayout,
  holdEndSec: (lastSampleSec: number) => number,
  font: string,
  nameInk: string,
): void {
  if (lanes.length === 0) return;
  const ratio = uPlot.pxRatio;
  const { ctx } = chart;
  const { height, left, top, width } = chart.bbox;
  const right = left + width;
  const xs = chart.data[0];
  const laneHeight = layout.laneHeightPx * ratio;
  const inset = SEGMENT_LABEL_INSET_PX * ratio;
  const textWidths = new Map<string, number>();
  const measure = (text: string) => {
    let measured = textWidths.get(text);
    if (measured === undefined) {
      measured = ctx.measureText(text).width;
      textWidths.set(text, measured);
    }
    return measured;
  };

  ctx.save();
  ctx.font = scaledFont(font, ratio);
  ctx.textBaseline = "middle";

  for (const [index, lane] of lanes.entries()) {
    const laneTop = top + layout.laneTopsPx[index] * ratio;
    const midY = laneTop + laneHeight / 2;
    if (laneTop >= top + height) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();
    ctx.fillStyle = LANE_TRACK_FILL;
    ctx.fillRect(left, laneTop, width, laneHeight);

    const column = chart.data[lane.column] as ArrayLike<
      number | null | undefined
    >;
    for (const segment of stateSegments(xs, column, holdEndSec)) {
      const x0 = chart.valToPos(segment.startSec, "x", true);
      const x1 = chart.valToPos(segment.endSec, "x", true);
      if (x1 < left || x0 > right) continue;
      const segmentWidth = Math.max(x1 - x0, ratio);
      const color = stateColor(segment.code);
      ctx.fillStyle = color;
      if (segmentWidth < MIN_EDGED_SEGMENT_PX * ratio) {
        ctx.fillRect(x0, laneTop, segmentWidth, laneHeight);
        continue;
      }
      ctx.globalAlpha = SEGMENT_FILL_ALPHA;
      ctx.fillRect(x0, laneTop, segmentWidth, laneHeight);
      ctx.globalAlpha = 1;
      ctx.fillRect(x0, laneTop, segmentWidth, SEGMENT_ACCENT_PX * ratio);
      ctx.fillStyle = TRANSITION_STROKE;
      ctx.fillRect(x0, laneTop, ratio, laneHeight);

      const visibleStart = Math.max(x0, left);
      const room = Math.min(x1, right) - visibleStart - inset * 2;
      const label = lane.labels[segment.code];
      if (label === undefined || room < MIN_LABELED_SEGMENT_PX * ratio) {
        continue;
      }
      const text = fitText(label, room, "end", measure);
      if (text) {
        ctx.fillStyle = SEGMENT_TEXT;
        ctx.textAlign = "left";
        ctx.fillText(text, visibleStart + inset, midY);
      }
    }
    ctx.fillStyle = lane.color;
    ctx.fillRect(left, laneTop, SERIES_MARKER_PX * ratio, laneHeight);
    ctx.restore();

    const name = fitText(
      lane.name,
      MAX_LANE_NAME_WIDTH_PX * ratio,
      "start",
      measure,
    );
    if (name) {
      ctx.fillStyle = nameInk;
      ctx.textAlign = "right";
      ctx.fillText(name, left - inset * 2, midY);
    }
  }
  ctx.restore();
}

/** CSS-pixel width the y-axis gutter needs for the widest lane name. */
export function laneNameGutterWidth(
  ctx: CanvasRenderingContext2D,
  names: readonly string[],
): number {
  let widest = 0;
  for (const name of names) {
    widest = Math.max(widest, ctx.measureText(name).width);
  }
  return Math.min(widest, MAX_LANE_NAME_WIDTH_PX);
}

/**
 * Shortens `text` until it fits `maxWidth`, eliding at its end (labels read
 * from the start) or its start (dotted names are most specific at the end).
 * Returns null when not even one character fits.
 */
function fitText(
  text: string,
  maxWidth: number,
  ellipsis: "end" | "start",
  measure: (text: string) => number,
): string | null {
  if (measure(text) <= maxWidth) return text;
  let low = 0;
  let high = text.length - 1;
  let best: string | null = null;
  while (low <= high) {
    const count = Math.ceil((low + high) / 2);
    const candidate =
      ellipsis === "end"
        ? `${text.slice(0, count)}…`
        : `…${text.slice(text.length - count)}`;
    if (count > 0 && measure(candidate) <= maxWidth) {
      best = candidate;
      low = count + 1;
    } else {
      high = count - 1;
    }
  }
  return best;
}

/** Scales the pixel size in a CSS font shorthand to canvas pixels. */
function scaledFont(font: string, ratio: number): string {
  return font.replace(/(\d+(?:\.\d+)?)px/, (_, size: string) => {
    return `${Number(size) * ratio}px`;
  });
}
