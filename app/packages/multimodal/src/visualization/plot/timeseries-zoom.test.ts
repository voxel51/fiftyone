import type uPlot from "uplot";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TIMESERIES_ZOOM_IN_FACTOR,
  TIMESERIES_ZOOM_OUT_FACTOR,
  touchZoomPanPlugin,
  zoomTimeseriesChart,
} from "./timeseries-zoom";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("zoomTimeseriesChart", () => {
  it("zooms only x around its midpoint", () => {
    const chart = chartStub({ x: [0, 100], y: [-50, 50] });

    zoomTimeseriesChart(chart.value, TIMESERIES_ZOOM_IN_FACTOR, [0, 100]);

    expect(chart.setScale).toHaveBeenCalledOnce();
    expect(chart.setScale).toHaveBeenCalledWith("x", {
      min: 10,
      max: 90,
    });
  });

  it("clamps zoom-out to the recording domain", () => {
    const chart = chartStub({ x: [10, 90], y: [-40, 40] });

    zoomTimeseriesChart(chart.value, TIMESERIES_ZOOM_OUT_FACTOR, [0, 100]);

    expect(chart.setScale).toHaveBeenCalledOnce();
    expect(chart.setScale).toHaveBeenCalledWith("x", {
      min: 0,
      max: 100,
    });
  });

  it("does nothing until uPlot has finite scale bounds", () => {
    const chart = chartStub({
      x: [undefined, undefined],
      y: [undefined, undefined],
    });

    zoomTimeseriesChart(chart.value, TIMESERIES_ZOOM_IN_FACTOR, [0, 100]);

    expect(chart.setScale).not.toHaveBeenCalled();
  });
});

describe("touchZoomPanPlugin", () => {
  it("pans with one finger without leaving the recording domain", () => {
    const chart = interactiveChartStub({ x: [20, 80], y: [20, 80] });
    const onInteraction = vi.fn();
    const plugin = touchZoomPanPlugin({
      onInteraction,
      xLimits: [0, 100],
    });
    initializePlugin(plugin, chart.value);
    const runFrame = captureAnimationFrame();

    dispatchTouch(chart.over, "touchstart", [[50, 50]]);
    dispatchTouch(document, "touchmove", [[60, 50]]);
    runFrame();

    expect(chart.scales.x).toEqual({ min: 14, max: 74 });
    expect(chart.scales.y).toEqual({ min: 20, max: 80 });
    expect(onInteraction).toHaveBeenCalledOnce();

    destroyPlugin(plugin, chart.value);
  });

  it("pinches x around the gesture midpoint without changing y", () => {
    const chart = interactiveChartStub({ x: [20, 80], y: [20, 80] });
    const plugin = touchZoomPanPlugin({ xLimits: [0, 100] });
    initializePlugin(plugin, chart.value);
    const runFrame = captureAnimationFrame();

    dispatchTouch(chart.over, "touchstart", [
      [40, 50],
      [60, 50],
    ]);
    dispatchTouch(document, "touchmove", [
      [30, 50],
      [70, 50],
    ]);
    runFrame();

    expect(chart.scales.x).toEqual({ min: 35, max: 65 });
    expect(chart.scales.y).toEqual({ min: 20, max: 80 });

    destroyPlugin(plugin, chart.value);
  });
});

function chartStub({
  x,
  y,
}: {
  readonly x: readonly [number | undefined, number | undefined];
  readonly y: readonly [number | undefined, number | undefined];
}) {
  const setScale = vi.fn();
  return {
    setScale,
    value: {
      batch: (callback: () => void) => callback(),
      scales: {
        x: { max: x[1], min: x[0] },
        y: { max: y[1], min: y[0] },
      },
      setScale,
    } as never,
  };
}

function interactiveChartStub({
  x,
  y,
}: {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
}) {
  const over = document.createElement("div");
  vi.spyOn(over, "getBoundingClientRect").mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const scales = {
    x: { max: x[1], min: x[0] },
    y: { max: y[1], min: y[0] },
  };
  const value = {
    batch: (callback: () => void) => callback(),
    over,
    posToVal: (position: number, key: "x" | "y") => {
      const scale = scales[key];
      const size = scale.max - scale.min;
      return key === "x"
        ? scale.min + (position / 100) * size
        : scale.max - (position / 100) * size;
    },
    scales,
    setScale: (key: "x" | "y", range: { min: number; max: number }) => {
      scales[key] = range;
    },
  };
  return { over, scales, value: value as never };
}

function initializePlugin(plugin: uPlot.Plugin, chart: uPlot): void {
  const init = plugin.hooks.init;
  if (typeof init !== "function") {
    throw new Error("expected one init hook");
  }
  init(chart, {} as uPlot.Options, []);
}

function destroyPlugin(plugin: uPlot.Plugin, chart: uPlot): void {
  const destroy = plugin.hooks.destroy;
  if (typeof destroy !== "function") {
    throw new Error("expected one destroy hook");
  }
  destroy(chart);
}

function captureAnimationFrame(): () => void {
  let callback: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
    callback = next;
    return 1;
  });
  return () => {
    if (!callback) {
      throw new Error("expected an animation frame");
    }
    callback(0);
  };
}

function dispatchTouch(
  target: EventTarget,
  type: string,
  points: readonly (readonly [x: number, y: number])[],
): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  target.dispatchEvent(event);
}
