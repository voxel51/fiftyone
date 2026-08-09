import { Icon, IconName, Size } from "@voxel51/voodo";
import React, { useEffect, useRef } from "react";
import uPlot, { type AlignedData } from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  PLOT_WINDOW_QUANTUM_SECONDS,
  PLOT_WINDOW_SECONDS,
} from "../../runtime/numeric-series-window";
import { CLICK_DRAG_TOLERANCE_PX } from "../interaction/interaction";
import styles from "./TimeseriesChart.module.css";
import {
  TIMESERIES_ZOOM_IN_FACTOR,
  TIMESERIES_ZOOM_OUT_FACTOR,
  touchZoomPanPlugin,
  zoomTimeseriesChart,
} from "./timeseries-zoom";

/** Identity of one drawn series: legend label + mark color. */
export interface TimeseriesChartSeries {
  readonly color: string;
  readonly label: string;
}

export interface TimeseriesViewport {
  readonly endSec: number;
  readonly mode: "follow" | "pinned";
  readonly pixelWidth: number;
  readonly startSec: number;
}

export interface TimeseriesCoverageRange {
  readonly endSec: number;
  readonly startSec: number;
}

export interface TimeseriesChartProps {
  /** uPlot aligned data: shared x vector plus one y vector per series. */
  readonly data: AlignedData;

  /** Fixed x range end (recording duration, seconds). */
  readonly durationSec: number;

  /**
   * Hover publication: called with the x value (seconds) under the
   * pointer while it is over the plot area, and null when it leaves.
   * Lets sibling time-axis surfaces echo a shared caret.
   */
  readonly onHoverTime?: (sec: number | null) => void;

  /** Click-to-seek callback with the clicked x value in seconds. */
  readonly onSeek?: (sec: number) => void;

  /** Called when a click or playhead drag settles on its final seek target. */
  readonly onSeekEnd?: () => void;

  /** Coalesced visible-range demand; user zoom/pan pins, reset follows. */
  readonly onViewportChange?: (viewport: TimeseriesViewport) => void;

  /** Ranges inspected for every rendered series; complements are unread. */
  readonly coverageRanges?: readonly TimeseriesCoverageRange[];

  /** Hard-unavailable ranges rendered distinctly from ordinary unread data. */
  readonly unavailableRanges?: readonly TimeseriesCoverageRange[];

  /**
   * Shared hover-time feed: called with a listener that moves the echo
   * caret (null hides it); returns an unsubscribe. The caret is a DOM
   * overlay and is suppressed while this chart is itself hovered —
   * uPlot's own cursor already marks the time there.
   */
  readonly registerHoverTimeListener?: (
    listener: (sec: number | null) => void,
  ) => () => void;

  /**
   * Playback-agnostic playhead feed: called with a listener that moves
   * the marker; returns an unsubscribe. The marker is a DOM overlay, so
   * RAF-cadence updates never redraw the canvas.
   */
  readonly registerPlayheadListener?: (
    listener: (sec: number) => void,
  ) => () => void;

  /**
   * Drawn series. Label, color, or order changes rebuild the chart.
   */
  readonly series: readonly TimeseriesChartSeries[];
}

const AXIS_INK = "#898781";
const GRID_STROKE = "#2c2c2a";
const TICK_STROKE = "#383835";
const CHART_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
const MIN_Y_AXIS_SIZE_PX = 52;
const Y_AXIS_LABEL_GUTTER_PX = 16;

const yAxisSize: uPlot.Axis.Size = (chart, values) => {
  if (!values || values.length === 0) {
    return MIN_Y_AXIS_SIZE_PX;
  }
  chart.ctx.save();
  chart.ctx.font = CHART_FONT;
  let widestLabel = 0;
  for (const value of values) {
    widestLabel = Math.max(
      widestLabel,
      chart.ctx.measureText(String(value)).width,
    );
  }
  chart.ctx.restore();
  return Math.max(
    MIN_Y_AXIS_SIZE_PX,
    Math.ceil(widestLabel + Y_AXIS_LABEL_GUTTER_PX),
  );
};

function resetTimeseriesChart(
  chart: uPlot,
  data: AlignedData,
  xRange: readonly [number, number],
): void {
  chart.batch(() => {
    chart.setData(data, true);
    chart.setScale("x", { min: xRange[0], max: xRange[1] });
  });
}

function followTimeseriesRange(
  playheadSec: number,
  durationSec: number,
): readonly [number, number] {
  if (durationSec <= PLOT_WINDOW_SECONDS) return [0, durationSec];
  const rawStart = playheadSec - PLOT_WINDOW_SECONDS / 2;
  const quantizedStart =
    Math.floor(rawStart / PLOT_WINDOW_QUANTUM_SECONDS) *
    PLOT_WINDOW_QUANTUM_SECONDS;
  const start = Math.max(
    0,
    Math.min(quantizedStart, durationSec - PLOT_WINDOW_SECONDS),
  );
  return [start, start + PLOT_WINDOW_SECONDS];
}

function positionTimeMarker(
  chart: uPlot,
  line: HTMLDivElement | null,
  sec: number | null,
  durationSec: number,
  suppressed: boolean,
): void {
  if (!line) return;
  if (sec === null || suppressed || sec < 0 || sec > durationSec) {
    line.style.display = "none";
    return;
  }
  line.style.display = "block";
  line.style.transform = `translateX(${chart.valToPos(sec, "x")}px)`;
}

function positionPlayhead(
  chart: uPlot,
  line: HTMLDivElement | null,
  sec: number | null,
  durationSec: number,
): void {
  positionTimeMarker(chart, line, sec, durationSec, false);
}

function positionHoverCaret(
  chart: uPlot,
  line: HTMLDivElement | null,
  sec: number | null,
  durationSec: number,
  suppressed: boolean,
): void {
  positionTimeMarker(chart, line, sec, durationSec, suppressed);
}

function finiteYRange(
  data: AlignedData,
  startSec: number,
  endSec: number,
): readonly [number, number] | null {
  const xs = data[0];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let column = 1; column < data.length; column += 1) {
    const values = data[column];
    for (let index = 0; index < xs.length; index += 1) {
      const x = xs[index];
      if (x < startSec || x > endSec) continue;
      const value = values[index];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.05, 1);
    return [min - padding, max + padding];
  }
  const padding = (max - min) * 0.05;
  return [min - padding, max + padding];
}

function setStableYRange(
  chart: uPlot,
  data: AlignedData,
  stableRef: React.MutableRefObject<readonly [number, number] | null>,
  settingRef: React.MutableRefObject<boolean>,
  reset: boolean,
): void {
  if (reset) stableRef.current = null;
  const xMin = chart.scales.x.min ?? 0;
  const xMax = chart.scales.x.max ?? xMin;
  const candidate = finiteYRange(data, xMin, xMax);
  if (!candidate) return;
  const previous = stableRef.current;
  const stable: readonly [number, number] = previous
    ? [Math.min(previous[0], candidate[0]), Math.max(previous[1], candidate[1])]
    : candidate;
  stableRef.current = stable;
  settingRef.current = true;
  chart.setScale("y", { min: stable[0], max: stable[1] });
  settingRef.current = false;
}

function renderCoverageBands(
  chart: uPlot,
  layer: HTMLDivElement | null,
  coverage: readonly TimeseriesCoverageRange[],
  unavailable: readonly TimeseriesCoverageRange[],
): void {
  if (!layer) return;
  layer.replaceChildren();
  const startSec = chart.scales.x.min ?? 0;
  const endSec = chart.scales.x.max ?? startSec;
  const known = mergeCoverageRanges(
    [...coverage, ...unavailable],
    startSec,
    endSec,
  );
  let cursor = startSec;
  for (const range of known) {
    if (range.startSec > cursor) {
      appendCoverageBand(chart, layer, cursor, range.startSec, "unread");
    }
    cursor = Math.max(cursor, range.endSec);
  }
  if (cursor < endSec) {
    appendCoverageBand(chart, layer, cursor, endSec, "unread");
  }
  for (const range of mergeCoverageRanges(unavailable, startSec, endSec)) {
    appendCoverageBand(
      chart,
      layer,
      range.startSec,
      range.endSec,
      "unavailable",
    );
  }
}

function mergeCoverageRanges(
  ranges: readonly TimeseriesCoverageRange[],
  startSec: number,
  endSec: number,
): TimeseriesCoverageRange[] {
  const merged: Array<{ endSec: number; startSec: number }> = [];
  for (const range of [...ranges].sort(
    (left, right) => left.startSec - right.startSec,
  )) {
    const start = Math.max(startSec, range.startSec);
    const end = Math.min(endSec, range.endSec);
    if (!(end > start)) continue;
    const previous = merged.at(-1);
    if (previous && start <= previous.endSec) {
      previous.endSec = Math.max(previous.endSec, end);
    } else {
      merged.push({ endSec: end, startSec: start });
    }
  }
  return merged;
}

function appendCoverageBand(
  chart: uPlot,
  layer: HTMLDivElement,
  startSec: number,
  endSec: number,
  kind: "unavailable" | "unread",
): void {
  if (!(endSec > startSec)) return;
  const startPx = chart.valToPos(startSec, "x");
  const endPx = chart.valToPos(endSec, "x");
  const band = document.createElement("div");
  band.className =
    kind === "unavailable" ? styles.unavailableBand : styles.unreadBand;
  band.dataset.testid = `timeseries-${kind}-band`;
  band.style.left = `${Math.min(startPx, endPx)}px`;
  band.style.width = `${Math.abs(endPx - startPx)}px`;
  layer.appendChild(band);
}

/**
 * Dense multi-series line chart on uPlot. Renders on the shared dark
 * visualization surface; identity is carried by the always-present
 * legend (live cursor values) plus mark color, never color alone. The
 * x scale shows the recording timeline while exact overlays distinguish
 * acquired data from unread and hard-unavailable spans. Touch gestures or
 * controls pin a viewport whose range and pixel width drive acquisition.
 */
export const TimeseriesChart: React.FC<TimeseriesChartProps> = ({
  data,
  durationSec,
  coverageRanges = [],
  onHoverTime,
  onSeek,
  onSeekEnd,
  onViewportChange,
  registerHoverTimeListener,
  registerPlayheadListener,
  series,
  unavailableRanges = [],
}) => {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const playheadSecRef = useRef<number | null>(null);
  const hoverLineRef = useRef<HTMLDivElement | null>(null);
  const hoverSecRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const hasInteractiveScaleRef = useRef(false);
  const coverageLayerRef = useRef<HTMLDivElement | null>(null);
  const stableYRangeRef = useRef<readonly [number, number] | null>(null);
  const settingStableYRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onSeekEndRef = useRef(onSeekEnd);
  onSeekEndRef.current = onSeekEnd;
  const onHoverTimeRef = useRef(onHoverTime);
  onHoverTimeRef.current = onHoverTime;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const coverageRangesRef = useRef(coverageRanges);
  coverageRangesRef.current = coverageRanges;
  const unavailableRangesRef = useRef(unavailableRanges);
  unavailableRangesRef.current = unavailableRanges;
  const seriesIdentity = JSON.stringify(series);
  const xMax = Math.max(durationSec, 1e-9);

  const handleZoomIn = () => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    hasInteractiveScaleRef.current = true;
    zoomTimeseriesChart(chart, TIMESERIES_ZOOM_IN_FACTOR, [0, xMax]);
  };

  const handleZoomOut = () => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    hasInteractiveScaleRef.current = true;
    zoomTimeseriesChart(chart, TIMESERIES_ZOOM_OUT_FACTOR, [0, xMax]);
  };

  const handleResetZoom = () => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    hasInteractiveScaleRef.current = false;
    resetTimeseriesChart(
      chart,
      dataRef.current,
      followTimeseriesRange(playheadSecRef.current ?? 0, durationSec),
    );
  };

  // This effect owns the uPlot instance lifecycle: create per series
  // identity / duration change, resize with the tile, destroy on
  // unmount. The playhead marker is created here imperatively so it can
  // live inside uPlot's plot-area overlay (axes and legend excluded).
  useEffect(() => {
    const host = plotRef.current;
    const currentSeries = seriesRef.current;
    if (!host || currentSeries.length === 0) {
      return undefined;
    }
    hasInteractiveScaleRef.current = false;
    stableYRangeRef.current = null;
    const xLimits = [0, xMax] as const;
    let viewportFrame: number | undefined;
    let stableViewportKey = "";
    const queueViewportPublication = (chart: uPlot) => {
      if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame);
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = undefined;
        onViewportChangeRef.current?.({
          endSec: chart.scales.x.max ?? xMax,
          mode: hasInteractiveScaleRef.current ? "pinned" : "follow",
          pixelWidth: Math.max(chart.over.clientWidth, host.clientWidth, 1),
          startSec: chart.scales.x.min ?? 0,
        });
      });
    };

    const options: uPlot.Options = {
      axes: [
        {
          font: CHART_FONT,
          grid: { stroke: GRID_STROKE, width: 1 },
          size: 28,
          stroke: AXIS_INK,
          ticks: { stroke: TICK_STROKE, width: 1 },
        },
        {
          font: CHART_FONT,
          grid: { stroke: GRID_STROKE, width: 1 },
          size: yAxisSize,
          stroke: AXIS_INK,
          ticks: { stroke: TICK_STROKE, width: 1 },
        },
      ],
      cursor: {
        drag: {
          dist: CLICK_DRAG_TOLERANCE_PX,
          setScale: true,
          x: true,
          y: true,
        },
        y: false,
      },
      height: Math.max(host.clientHeight, 80),
      hooks: {
        draw: [
          (chart) =>
            positionPlayhead(
              chart,
              playheadLineRef.current,
              playheadSecRef.current,
              durationSec,
            ),
          (chart) =>
            positionHoverCaret(
              chart,
              hoverLineRef.current,
              hoverSecRef.current,
              durationSec,
              pointerInsideRef.current,
            ),
          (chart) =>
            renderCoverageBands(
              chart,
              coverageLayerRef.current,
              coverageRangesRef.current,
              unavailableRangesRef.current,
            ),
        ],
        setScale: [
          (chart, key) => {
            if (key === "x") {
              const viewportKey = `${chart.scales.x.min}:${chart.scales.x.max}`;
              if (viewportKey !== stableViewportKey) {
                stableViewportKey = viewportKey;
                setStableYRange(
                  chart,
                  dataRef.current,
                  stableYRangeRef,
                  settingStableYRef,
                  true,
                );
              }
              renderCoverageBands(
                chart,
                coverageLayerRef.current,
                coverageRangesRef.current,
                unavailableRangesRef.current,
              );
              queueViewportPublication(chart);
            } else if (key === "y" && !settingStableYRef.current) {
              const min = chart.scales.y.min;
              const max = chart.scales.y.max;
              if (min !== undefined && max !== undefined) {
                stableYRangeRef.current = [min, max];
              }
            }
          },
        ],
        setSelect: [
          () => {
            hasInteractiveScaleRef.current = true;
          },
        ],
      },
      legend: { live: true },
      plugins: [
        touchZoomPanPlugin({
          onInteraction: () => {
            hasInteractiveScaleRef.current = true;
          },
          xLimits,
        }),
      ],
      scales: {
        x: { time: false },
      },
      series: [
        { label: "Time" },
        ...currentSeries.map((entry) => ({
          label: entry.label,
          points: { show: false },
          spanGaps: false,
          stroke: entry.color,
          width: 2,
        })),
      ],
      width: Math.max(host.clientWidth, 160),
    };

    const chart = new uPlot(options, dataRef.current, host);
    chartRef.current = chart;
    chart.setScale("x", { min: 0, max: xMax });
    const initialYMin = chart.scales.y.min;
    const initialYMax = chart.scales.y.max;
    stableYRangeRef.current =
      initialYMin !== undefined && initialYMax !== undefined
        ? [initialYMin, initialYMax]
        : null;

    const coverageLayer = document.createElement("div");
    coverageLayer.className = styles.coverageLayer;
    coverageLayer.dataset.testid = "timeseries-coverage-layer";
    chart.over.appendChild(coverageLayer);
    coverageLayerRef.current = coverageLayer;
    renderCoverageBands(
      chart,
      coverageLayer,
      coverageRangesRef.current,
      unavailableRangesRef.current,
    );

    const line = document.createElement("div");
    line.className = styles.playhead;
    line.dataset.testid = "timeseries-playhead";
    line.style.display = "none";
    chart.over.appendChild(line);
    playheadLineRef.current = line;
    positionPlayhead(chart, line, playheadSecRef.current, durationSec);

    const hoverLine = document.createElement("div");
    hoverLine.className = styles.hoverCaret;
    hoverLine.dataset.testid = "timeseries-hover-caret";
    hoverLine.style.display = "none";
    chart.over.appendChild(hoverLine);
    hoverLineRef.current = hoverLine;
    positionHoverCaret(
      chart,
      hoverLine,
      hoverSecRef.current,
      durationSec,
      pointerInsideRef.current,
    );

    // Click-to-seek listens on uPlot's own overlay so plot-area padding
    // and axes never miscount; pointer travel separates click from drag.
    const over = chart.over;
    const activePointerIds = new Set<number>();
    let downPoint: {
      readonly pointerId: number;
      readonly x: number;
      readonly y: number;
    } | null = null;
    let playheadDrag: {
      readonly pointerId: number;
      readonly startClientX: number;
      readonly startPositionPx: number;
    } | null = null;
    let suppressSeek = false;

    const seekPlayheadDrag = (event: PointerEvent) => {
      const drag = playheadDrag;
      const seek = onSeekRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !seek) {
        return;
      }
      const positionPx =
        drag.startPositionPx + event.clientX - drag.startClientX;
      const sec = chart.posToVal(positionPx, "x");
      if (Number.isFinite(sec)) {
        seek(Math.min(Math.max(sec, 0), durationSec));
      }
    };

    const finishPlayheadDrag = (event: PointerEvent) => {
      const drag = playheadDrag;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playheadDrag = null;
      line.classList.remove(styles.playheadDragging);
      if (line.hasPointerCapture?.(event.pointerId)) {
        line.releasePointerCapture(event.pointerId);
      }
      onSeekEndRef.current?.();
    };

    const onPlayheadPointerDown = (event: PointerEvent) => {
      const sec = playheadSecRef.current;
      if (
        playheadDrag ||
        sec === null ||
        !onSeekRef.current ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playheadDrag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startPositionPx: chart.valToPos(sec, "x"),
      };
      line.classList.add(styles.playheadDragging);
      line.setPointerCapture?.(event.pointerId);
    };
    const onPlayheadPointerMove = (event: PointerEvent) => {
      if (playheadDrag?.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      seekPlayheadDrag(event);
    };
    const onPlayheadPointerUp = (event: PointerEvent) => {
      finishPlayheadDrag(event);
    };
    const onPlayheadPointerCancel = (event: PointerEvent) => {
      finishPlayheadDrag(event);
    };
    const onPlayheadLostPointerCapture = (event: PointerEvent) => {
      if (playheadDrag?.pointerId !== event.pointerId) {
        return;
      }
      playheadDrag = null;
      line.classList.remove(styles.playheadDragging);
      onSeekEndRef.current?.();
    };
    // uPlot starts its selection gesture from `mousedown`; stopping the
    // compatibility event keeps grabbing the playhead distinct from the
    // surrounding plot's box-zoom interaction.
    const onPlayheadMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      activePointerIds.add(event.pointerId);
      if (activePointerIds.size === 1) {
        downPoint = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        suppressSeek = false;
      } else {
        suppressSeek = true;
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      activePointerIds.delete(event.pointerId);
      const start = downPoint;
      if (start?.pointerId !== event.pointerId) {
        if (activePointerIds.size === 0) {
          suppressSeek = false;
        }
        return;
      }
      const shouldSuppressSeek = suppressSeek;
      downPoint = null;
      if (activePointerIds.size === 0) {
        suppressSeek = false;
      }
      if (
        start === null ||
        shouldSuppressSeek ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
          CLICK_DRAG_TOLERANCE_PX
      ) {
        return;
      }
      const seek = onSeekRef.current;
      if (!seek) {
        return;
      }
      const rect = over.getBoundingClientRect();
      const sec = chart.posToVal(event.clientX - rect.left, "x");
      if (Number.isFinite(sec)) {
        seek(Math.min(Math.max(sec, 0), durationSec));
        onSeekEndRef.current?.();
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      activePointerIds.delete(event.pointerId);
      if (downPoint?.pointerId === event.pointerId) {
        downPoint = null;
      }
      if (activePointerIds.size === 0) {
        suppressSeek = false;
      }
    };
    const onPointerEnter = () => {
      pointerInsideRef.current = true;
      positionHoverCaret(
        chart,
        hoverLine,
        hoverSecRef.current,
        durationSec,
        true,
      );
    };
    const onPointerMove = (event: PointerEvent) => {
      const publish = onHoverTimeRef.current;
      if (!publish) {
        return;
      }
      const rect = over.getBoundingClientRect();
      const sec = chart.posToVal(event.clientX - rect.left, "x");
      if (Number.isFinite(sec)) {
        publish(Math.min(Math.max(sec, 0), durationSec));
      }
    };
    const onPointerLeave = () => {
      activePointerIds.clear();
      downPoint = null;
      suppressSeek = false;
      pointerInsideRef.current = false;
      positionHoverCaret(
        chart,
        hoverLine,
        hoverSecRef.current,
        durationSec,
        false,
      );
      onHoverTimeRef.current?.(null);
    };
    // uPlot resets its scales on double click. In this surface a double click
    // is also two seek clicks, so keep seek semantics and make reset an
    // explicit control instead.
    const onDoubleClickCapture = (event: MouseEvent) => {
      event.stopImmediatePropagation();
    };
    line.addEventListener("pointerdown", onPlayheadPointerDown);
    line.addEventListener("pointermove", onPlayheadPointerMove);
    line.addEventListener("pointerup", onPlayheadPointerUp);
    line.addEventListener("pointercancel", onPlayheadPointerCancel);
    line.addEventListener("lostpointercapture", onPlayheadLostPointerCapture);
    line.addEventListener("mousedown", onPlayheadMouseDown);
    over.addEventListener("pointerdown", onPointerDown);
    over.addEventListener("pointerup", onPointerUp);
    over.addEventListener("pointercancel", onPointerCancel);
    over.addEventListener("pointerenter", onPointerEnter);
    over.addEventListener("pointermove", onPointerMove);
    over.addEventListener("pointerleave", onPointerLeave);
    over.addEventListener("dblclick", onDoubleClickCapture, true);

    // The chart fills the tile; the legend below the canvas is part of
    // the measured host, so size to the remainder.
    const resizeChart = () => {
      const legendHeight =
        host.querySelector<HTMLElement>(".u-legend")?.offsetHeight ?? 0;
      host.style.setProperty("--timeseries-legend-height", `${legendHeight}px`);
      const width = host.clientWidth;
      const height = host.clientHeight - legendHeight;
      if (width > 0 && height > 40) {
        chart.setSize({ height, width });
        renderCoverageBands(
          chart,
          coverageLayer,
          coverageRangesRef.current,
          unavailableRangesRef.current,
        );
        queueViewportPublication(chart);
      }
    };
    const observer = new ResizeObserver(resizeChart);
    observer.observe(host);
    resizeChart();

    return () => {
      observer.disconnect();
      if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame);
      line.removeEventListener("pointerdown", onPlayheadPointerDown);
      line.removeEventListener("pointermove", onPlayheadPointerMove);
      line.removeEventListener("pointerup", onPlayheadPointerUp);
      line.removeEventListener("pointercancel", onPlayheadPointerCancel);
      line.removeEventListener(
        "lostpointercapture",
        onPlayheadLostPointerCapture,
      );
      line.removeEventListener("mousedown", onPlayheadMouseDown);
      over.removeEventListener("pointerdown", onPointerDown);
      over.removeEventListener("pointerup", onPointerUp);
      over.removeEventListener("pointercancel", onPointerCancel);
      over.removeEventListener("pointerenter", onPointerEnter);
      over.removeEventListener("pointermove", onPointerMove);
      over.removeEventListener("pointerleave", onPointerLeave);
      over.removeEventListener("dblclick", onDoubleClickCapture, true);
      // A chart torn down mid-hover must not leave a stale caret in
      // sibling surfaces.
      if (pointerInsideRef.current) {
        pointerInsideRef.current = false;
        onHoverTimeRef.current?.(null);
      }
      playheadLineRef.current = null;
      hoverLineRef.current = null;
      coverageLayerRef.current = null;
      chartRef.current = null;
      chart.destroy();
    };
  }, [durationSec, seriesIdentity, xMax]);

  // This effect pushes progressive data without resetting either viewport.
  // The y domain may expand to reveal new extrema, but never contracts while
  // the same viewport fills, avoiding page-by-page scale oscillation.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setData(data, false);
    setStableYRange(chart, data, stableYRangeRef, settingStableYRef, false);
    chart.redraw();
  }, [data]);

  // This effect redraws exact unread/unavailable overlays without touching
  // chart data or scales.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    renderCoverageBands(
      chart,
      coverageLayerRef.current,
      coverageRanges,
      unavailableRanges,
    );
  }, [coverageRanges, unavailableRanges]);

  // This effect subscribes the echo caret to the shared hover-time feed;
  // caret moves are DOM transforms, never chart redraws.
  useEffect(() => {
    if (!registerHoverTimeListener) {
      return undefined;
    }
    return registerHoverTimeListener((sec) => {
      hoverSecRef.current = sec;
      const chart = chartRef.current;
      if (!chart) return;
      positionHoverCaret(
        chart,
        hoverLineRef.current,
        sec,
        durationSec,
        pointerInsideRef.current,
      );
    });
  }, [durationSec, registerHoverTimeListener]);

  // This effect subscribes the playhead marker to the caller's playback
  // feed; marker moves are DOM transforms, never chart redraws.
  useEffect(() => {
    if (!registerPlayheadListener) {
      return undefined;
    }
    return registerPlayheadListener((sec) => {
      playheadSecRef.current = sec;
      const chart = chartRef.current;
      if (!chart) return;
      if (!hasInteractiveScaleRef.current) {
        const [min, max] = followTimeseriesRange(sec, durationSec);
        if (chart.scales.x.min !== min || chart.scales.x.max !== max) {
          chart.setScale("x", { min, max });
        }
      }
      positionPlayhead(chart, playheadLineRef.current, sec, durationSec);
    });
  }, [durationSec, registerPlayheadListener]);

  return (
    <div className={styles.root} data-testid="timeseries-chart">
      <div className={styles.plot} ref={plotRef}>
        <div className={styles.controls}>
          <ChartControl
            icon={IconName.Add}
            label="Zoom in"
            onClick={handleZoomIn}
          />
          <ChartControl
            icon={IconName.Remove}
            label="Zoom out"
            onClick={handleZoomOut}
          />
          <ChartControl
            icon={IconName.Fullscreen}
            label="Reset zoom"
            onClick={handleResetZoom}
          />
        </div>
      </div>
    </div>
  );
};

interface ChartControlProps {
  readonly icon: IconName;
  readonly label: string;
  readonly onClick: () => void;
}

const ChartControl: React.FC<ChartControlProps> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    aria-label={label}
    className={styles.controlButton}
    onClick={onClick}
    onPointerDown={(event) => event.stopPropagation()}
    title={label}
    type="button"
  >
    <Icon className={styles.controlIcon} name={icon} size={Size.Xs} />
  </button>
);

export default TimeseriesChart;
