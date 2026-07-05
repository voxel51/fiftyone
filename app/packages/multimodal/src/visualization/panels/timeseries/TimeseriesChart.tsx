import React, { useEffect, useRef } from "react";
import uPlot, { type AlignedData } from "uplot";
import "uplot/dist/uPlot.min.css";
import styles from "./TimeseriesChart.module.css";

/** Identity of one drawn series: legend label + mark color. */
export interface TimeseriesChartSeries {
  readonly color: string;
  readonly label: string;
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
   * Drawn series. Identity changes rebuild the chart — memoize in the
   * caller.
   */
  readonly series: readonly TimeseriesChartSeries[];
}

const AXIS_INK = "#898781";
const GRID_STROKE = "#2c2c2a";
const TICK_STROKE = "#383835";
const CHART_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
/** Pointer travel beyond this is a drag, not a click-to-seek. */
const CLICK_SLOP_PX = 4;

/**
 * Dense multi-series line chart on uPlot. Renders on the shared dark
 * visualization surface; identity is carried by the always-present
 * legend (live cursor values) plus mark color, never color alone. The
 * x scale is fixed to the full recording so the playhead overlay and
 * click-to-seek map 1:1 onto playback time.
 */
export const TimeseriesChart: React.FC<TimeseriesChartProps> = ({
  data,
  durationSec,
  onHoverTime,
  onSeek,
  registerHoverTimeListener,
  registerPlayheadListener,
  series,
}) => {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const playheadSecRef = useRef<number | null>(null);
  const hoverLineRef = useRef<HTMLDivElement | null>(null);
  const hoverSecRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onHoverTimeRef = useRef(onHoverTime);
  onHoverTimeRef.current = onHoverTime;

  // This effect owns the uPlot instance lifecycle: create per series
  // identity / duration change, resize with the tile, destroy on
  // unmount. The playhead marker is created here imperatively so it can
  // live inside uPlot's plot-area overlay (axes and legend excluded).
  useEffect(() => {
    const host = plotRef.current;
    if (!host || series.length === 0) {
      return undefined;
    }

    const positionPlayhead = (chart: uPlot) => {
      const line = playheadLineRef.current;
      if (!line) {
        return;
      }
      const sec = playheadSecRef.current;
      if (sec === null || sec < 0 || sec > durationSec) {
        line.style.display = "none";
        return;
      }
      line.style.display = "block";
      line.style.transform = `translateX(${chart.valToPos(sec, "x")}px)`;
    };

    const positionHoverCaret = (chart: uPlot) => {
      const line = hoverLineRef.current;
      if (!line) {
        return;
      }
      const sec = hoverSecRef.current;
      // Suppressed while this chart is the hover source: uPlot's own
      // cursor already marks the time there.
      if (
        sec === null ||
        pointerInsideRef.current ||
        sec < 0 ||
        sec > durationSec
      ) {
        line.style.display = "none";
        return;
      }
      line.style.display = "block";
      line.style.transform = `translateX(${chart.valToPos(sec, "x")}px)`;
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
          size: 48,
          stroke: AXIS_INK,
          ticks: { stroke: TICK_STROKE, width: 1 },
        },
      ],
      cursor: {
        drag: { setScale: false, x: false, y: false },
        y: false,
      },
      height: Math.max(host.clientHeight, 80),
      hooks: {
        draw: [positionPlayhead, positionHoverCaret],
      },
      legend: { live: true },
      scales: {
        x: { range: [0, Math.max(durationSec, 1e-9)], time: false },
      },
      series: [
        {},
        ...series.map((entry) => ({
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

    const line = document.createElement("div");
    line.className = styles.playhead;
    line.style.display = "none";
    chart.over.appendChild(line);
    playheadLineRef.current = line;
    positionPlayhead(chart);

    const hoverLine = document.createElement("div");
    hoverLine.className = styles.hoverCaret;
    hoverLine.style.display = "none";
    chart.over.appendChild(hoverLine);
    hoverLineRef.current = hoverLine;
    positionHoverCaret(chart);

    // Click-to-seek listens on uPlot's own overlay so plot-area padding
    // and axes never miscount; pointer travel separates click from drag.
    const over = chart.over;
    let downX: number | null = null;
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
    };
    const onPointerUp = (event: PointerEvent) => {
      const startX = downX;
      downX = null;
      if (startX === null || Math.abs(event.clientX - startX) > CLICK_SLOP_PX) {
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
      }
    };
    const onPointerEnter = () => {
      pointerInsideRef.current = true;
      positionHoverCaret(chart);
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
      pointerInsideRef.current = false;
      positionHoverCaret(chart);
      onHoverTimeRef.current?.(null);
    };
    over.addEventListener("pointerdown", onPointerDown);
    over.addEventListener("pointerup", onPointerUp);
    over.addEventListener("pointerenter", onPointerEnter);
    over.addEventListener("pointermove", onPointerMove);
    over.addEventListener("pointerleave", onPointerLeave);

    // The chart fills the tile; the legend below the canvas is part of
    // the measured host, so size to the remainder.
    const observer = new ResizeObserver(() => {
      const legendHeight =
        host.querySelector<HTMLElement>(".u-legend")?.offsetHeight ?? 0;
      const width = host.clientWidth;
      const height = host.clientHeight - legendHeight;
      if (width > 0 && height > 40) {
        chart.setSize({ height, width });
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      over.removeEventListener("pointerdown", onPointerDown);
      over.removeEventListener("pointerup", onPointerUp);
      over.removeEventListener("pointerenter", onPointerEnter);
      over.removeEventListener("pointermove", onPointerMove);
      over.removeEventListener("pointerleave", onPointerLeave);
      // A chart torn down mid-hover must not leave a stale caret in
      // sibling surfaces.
      if (pointerInsideRef.current) {
        pointerInsideRef.current = false;
        onHoverTimeRef.current?.(null);
      }
      playheadLineRef.current = null;
      hoverLineRef.current = null;
      chartRef.current = null;
      chart.destroy();
    };
  }, [durationSec, series]);

  // This effect pushes new data into the existing instance without a
  // rebuild.
  useEffect(() => {
    chartRef.current?.setData(data, true);
  }, [data]);

  // This effect subscribes the echo caret to the shared hover-time feed;
  // caret moves are DOM transforms, never chart redraws.
  useEffect(() => {
    if (!registerHoverTimeListener) {
      return undefined;
    }
    return registerHoverTimeListener((sec) => {
      hoverSecRef.current = sec;
      const chart = chartRef.current;
      const line = hoverLineRef.current;
      if (!chart || !line) {
        return;
      }
      if (
        sec === null ||
        pointerInsideRef.current ||
        sec < 0 ||
        sec > durationSec
      ) {
        line.style.display = "none";
        return;
      }
      line.style.display = "block";
      line.style.transform = `translateX(${chart.valToPos(sec, "x")}px)`;
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
      const line = playheadLineRef.current;
      if (!chart || !line) {
        return;
      }
      if (sec < 0 || sec > durationSec) {
        line.style.display = "none";
        return;
      }
      line.style.display = "block";
      line.style.transform = `translateX(${chart.valToPos(sec, "x")}px)`;
    });
  }, [durationSec, registerPlayheadListener]);

  return (
    <div className={styles.root} data-cy="timeseries-chart">
      <div className={styles.plot} ref={plotRef} />
    </div>
  );
};

export default TimeseriesChart;
