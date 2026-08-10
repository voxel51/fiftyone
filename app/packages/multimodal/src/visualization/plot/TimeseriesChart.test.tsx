import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AlignedData } from "uplot";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimeseriesChart from "./TimeseriesChart";

interface MockHookPlugin {
  readonly hooks: {
    readonly destroy?: MockHook | readonly MockHook[];
    readonly init?: MockHook | readonly MockHook[];
  };
}

type MockHook = (chart: MockChart, options?: unknown, data?: unknown) => void;

interface MockOptions {
  readonly axes?: readonly {
    readonly size?:
      | number
      | ((
          chart: MockChart,
          values: string[],
          axisIdx: number,
          cycleNum: number,
        ) => number);
  }[];
  readonly cursor?: {
    readonly drag?: {
      readonly dist?: number;
      readonly setScale?: boolean;
      readonly x?: boolean;
      readonly y?: boolean;
    };
  };
  readonly hooks?: {
    readonly draw?: MockHook | readonly MockHook[];
    readonly setScale?: MockHook | readonly MockHook[];
    readonly setSelect?: MockHook | readonly MockHook[];
  };
  readonly plugins?: readonly MockHookPlugin[];
  readonly scales?: {
    readonly x?: {
      readonly range?: readonly [number, number];
    };
  };
  readonly series?: readonly {
    readonly class?: string;
    readonly label?: string;
  }[];
}

interface MockChart {
  readonly ctx: {
    font: string;
    readonly measureText: (value: string) => { readonly width: number };
    readonly restore: () => void;
    readonly save: () => void;
  };
  readonly data: unknown;
  readonly options: MockOptions;
  readonly over: HTMLDivElement;
  readonly root: HTMLDivElement;
  readonly scales: {
    readonly x: { max: number; min: number };
    readonly y: { max: number; min: number };
  };
  readonly redraw: ReturnType<typeof vi.fn>;
  readonly setCursor: ReturnType<typeof vi.fn>;
  readonly setData: ReturnType<typeof vi.fn>;
  readonly setScale: ReturnType<typeof vi.fn>;
}

const uPlotMock = vi.hoisted(() => ({
  instances: [] as MockChart[],
}));

vi.mock("uplot", () => ({
  default: class MockUPlot {
    data: unknown;
    ctx = {
      font: "",
      measureText: (value: string) => ({ width: value.length * 7 }),
      restore: vi.fn(),
      save: vi.fn(),
    };
    options: MockOptions;
    over = document.createElement("div");
    root = document.createElement("div");
    scales = {
      x: { max: 20, min: 0 },
      y: { max: 10, min: 0 },
    };
    redraw = vi.fn();
    setCursor = vi.fn();
    setData = vi.fn((data: unknown, _resetScales?: boolean) => {
      this.data = data;
    });
    setScale = vi.fn(
      (
        key: "x" | "y",
        range: { readonly max: number; readonly min: number },
      ) => {
        const configuredRange =
          key === "x" ? this.options.scales?.x?.range : undefined;
        this.scales[key] = configuredRange
          ? { max: configuredRange[1], min: configuredRange[0] }
          : { max: range.max, min: range.min };
      },
    );
    setSize = vi.fn();

    constructor(options: MockOptions, data: unknown, host: HTMLElement) {
      this.options = options;
      this.data = data;
      this.over.className = "u-over";
      this.root.appendChild(this.over);
      const legend = document.createElement("div");
      legend.className = "u-legend";
      this.root.appendChild(legend);
      host.appendChild(this.root);
      this.over.addEventListener("dblclick", () => {
        this.setData(this.data, true);
      });
      uPlotMock.instances.push(this as unknown as MockChart);
      for (const plugin of options.plugins ?? []) {
        runHooks(
          plugin.hooks.init,
          this as unknown as MockChart,
          options,
          data,
        );
      }
    }

    batch(callback: () => void) {
      callback();
    }

    destroy() {
      for (const plugin of this.options.plugins ?? []) {
        runHooks(plugin.hooks.destroy, this as unknown as MockChart);
      }
      this.root.remove();
    }

    posToVal(position: number) {
      return position;
    }

    valToPos(value: number) {
      return value;
    }
  },
}));

vi.mock("@voxel51/voodo", () => ({
  Icon: ({ name }: { readonly name: string }) => <span>{name}</span>,
  IconName: { Add: "add", Fullscreen: "fullscreen", Remove: "remove" },
  Size: { Xs: "xs" },
}));

afterEach(() => {
  uPlotMock.instances.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TimeseriesChart interactions", () => {
  it("renders zoom controls and resets only from the explicit button", () => {
    const { unmount } = renderChart();
    const chart = lastChart();
    const resetZoom = screen.getByLabelText("Reset zoom");
    chart.setData.mockClear();
    expect(resetZoom.getAttribute("data-active")).toBeNull();

    fireEvent.click(screen.getByLabelText("Zoom in"));
    expect(resetZoom.getAttribute("data-active")).toBe("true");
    expect(chart.scales.x).toEqual({ min: 2, max: 18 });
    expect(chart.scales.y).toEqual({ min: 1, max: 9 });
    expect(chart.setScale).toHaveBeenCalledWith("x", {
      min: 2,
      max: 18,
    });
    expect(chart.setScale).toHaveBeenCalledWith("y", {
      min: 1,
      max: 9,
    });

    fireEvent.click(screen.getByLabelText("Zoom out"));
    expect(chart.scales.x).toEqual({ min: 0, max: 20 });
    expect(chart.scales.y).toEqual({ min: 0, max: 10 });

    chart.setData.mockClear();
    chart.over.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(chart.setData).not.toHaveBeenCalled();

    fireEvent.click(resetZoom);
    expect(chart.setData).toHaveBeenCalledWith(DATA, true);
    expect(resetZoom.getAttribute("data-active")).toBeNull();
    unmount();
  });

  it("delays an external reset request until the plot settles", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        resetZoomRevision={0}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    fireEvent.click(screen.getByLabelText("Zoom in"));
    chart.setData.mockClear();

    rerender(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        resetZoomRevision={1}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    vi.advanceTimersByTime(99);
    expect(chart.setData).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(chart.setData).toHaveBeenCalledWith(DATA, true);
    expect(chart.scales.x).toEqual({ min: 0, max: 20 });
    unmount();
  });

  it("repaints a zoomed chart when new data arrives", () => {
    const onSeek = vi.fn();
    const { rerender, unmount } = renderChart(onSeek);
    const chart = lastChart();

    fireEvent.click(screen.getByLabelText("Zoom in"));
    chart.setData.mockClear();
    chart.redraw.mockClear();

    const nextData = [
      [0, 10, 20],
      [1, 3, 2],
    ] as AlignedData;
    rerender(
      <TimeseriesChart
        data={nextData}
        durationSec={20}
        onSeek={onSeek}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );

    expect(uPlotMock.instances).toHaveLength(1);
    // setData(…, false) swaps the arrays without committing a repaint; the
    // explicit redraw is what makes newly fetched windows visible while the
    // user-controlled viewport is preserved.
    expect(chart.setData).toHaveBeenCalledWith(nextData, false);
    expect(chart.redraw).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps the y domain stable while progressive data fills", () => {
    const { rerender, unmount } = renderChart();
    const chart = lastChart();
    chart.setScale.mockClear();

    const narrower = [
      [0, 10, 20],
      [4, 5, 4],
    ] as AlignedData;
    rerender(
      <TimeseriesChart
        data={narrower}
        durationSec={20}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    expect(chart.setScale).toHaveBeenLastCalledWith("y", {
      max: 10,
      min: 0,
    });

    const wider = [
      [0, 10, 20],
      [-20, 30, 0],
    ] as AlignedData;
    rerender(
      <TimeseriesChart
        data={wider}
        durationSec={20}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    expect(chart.setScale).toHaveBeenLastCalledWith("y", {
      max: 32.5,
      min: -22.5,
    });
    unmount();
  });

  it("distinguishes unread spans from unavailable and decoded gaps", () => {
    const data = [
      [0, 2, 5],
      [1, null, 3],
    ] as AlignedData;
    const { unmount } = render(
      <TimeseriesChart
        coverageRanges={[{ endSec: 5, startSec: 0 }]}
        data={data}
        durationSec={20}
        series={[{ color: "#f00", label: "speed" }]}
        unavailableRanges={[{ endSec: 15, startSec: 10 }]}
      />,
    );

    const unread = screen.getAllByTestId("timeseries-unread-band");
    expect(unread).toHaveLength(2);
    expect(unread.map((band) => [band.style.left, band.style.width])).toEqual([
      ["5px", "5px"],
      ["15px", "5px"],
    ]);
    expect(screen.getByTestId("timeseries-unavailable-band").style.left).toBe(
      "10px",
    );
    unmount();
  });

  it("keeps coverage overlays stable across canvas-only redraws", () => {
    const { unmount } = render(
      <TimeseriesChart
        coverageRanges={[{ endSec: 5, startSec: 0 }]}
        data={DATA}
        durationSec={20}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    const unread = screen.getByTestId("timeseries-unread-band");

    runHooks(chart.options.hooks?.draw, chart);

    expect(screen.getByTestId("timeseries-unread-band")).toBe(unread);
    unmount();
  });

  it("coalesces viewport publication and marks interaction as pinned", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    const onViewportChange = vi.fn();
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        onViewportChange={onViewportChange}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    act(() => runHooks(chart.options.hooks?.setSelect, chart));
    expect(
      screen.getByLabelText("Reset zoom").getAttribute("data-active"),
    ).toBe("true");
    chart.scales.x.min = 4;
    chart.scales.x.max = 12;
    runHooks(chart.options.hooks?.setScale, chart, "x");
    chart.scales.x.min = 5;
    chart.scales.x.max = 10;
    runHooks(chart.options.hooks?.setScale, chart, "x");

    expect(frames.size).toBe(1);
    const callback = [...frames.values()][0];
    frames.clear();
    callback(0);
    expect(onViewportChange).toHaveBeenCalledOnce();
    expect(onViewportChange).toHaveBeenCalledWith({
      endSec: 10,
      mode: "pinned",
      pixelWidth: 1,
      startSec: 5,
    });
    unmount();
  });

  it("configures region selection and a label-sized y-axis gutter", () => {
    const { unmount } = renderChart();
    const chart = lastChart();

    expect(chart.options.cursor?.drag).toEqual({
      dist: 4,
      setScale: true,
      x: true,
      y: false,
    });
    expect(chart.options.scales?.x?.range).toBeUndefined();
    expect(chart.options.series?.[0]).toEqual({
      class: expect.any(String),
      label: "Time",
    });

    const size = chart.options.axes?.[1]?.size;
    if (typeof size !== "function") {
      throw new Error("expected a dynamic y-axis size");
    }
    expect(size(chart, ["100000", "-123456.7"], 1, 1)).toBe(79);
    unmount();
  });

  it("keeps tap-to-seek and ignores pointer travel from a pan", () => {
    const onSeek = vi.fn();
    const onSeekEnd = vi.fn();
    const { unmount } = renderChart(onSeek, onSeekEnd);
    const over = lastChart().over;

    dispatchPointer(over, "pointerdown", 5, 5);
    dispatchPointer(over, "pointerup", 5, 5);
    expect(onSeek).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(5);
    expect(onSeekEnd).toHaveBeenCalledOnce();

    dispatchPointer(over, "pointerdown", 5, 5);
    dispatchPointer(over, "pointerup", 5, 20);
    expect(onSeek).toHaveBeenCalledOnce();

    dispatchPointer(over, "pointerdown", 5, 5, 1);
    dispatchPointer(over, "pointerdown", 15, 5, 2);
    dispatchPointer(over, "pointerup", 15, 5, 2);
    dispatchPointer(over, "pointerup", 5, 5, 1);
    expect(onSeek).toHaveBeenCalledOnce();
    expect(onSeekEnd).toHaveBeenCalledOnce();
    unmount();
  });

  it("scrubs continuously when the playhead marker is grabbed", () => {
    const onSeek = vi.fn();
    const onSeekEnd = vi.fn();
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        onSeek={onSeek}
        onSeekEnd={onSeekEnd}
        registerPlayheadListener={(listener) => {
          listener(5);
          return vi.fn();
        }}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    const playhead = screen.getByTestId("timeseries-playhead");
    chart.setCursor.mockClear();

    dispatchPointer(playhead, "pointerdown", 5, 5);
    expect(playhead.className).toContain("playheadDragging");
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 5, top: 0 },
      false,
    );

    dispatchPointer(playhead, "pointermove", 12, 5);
    dispatchPointer(playhead, "pointermove", 15, 5);
    expect(onSeek.mock.calls).toEqual([[12], [15]]);
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 15, top: 0 },
      false,
    );

    dispatchPointer(playhead, "pointerup", 15, 5);
    expect(playhead.className).not.toContain("playheadDragging");
    expect(onSeekEnd).toHaveBeenCalledOnce();
    unmount();
  });

  it("keeps legend values on shared hover or playhead outside the plot", () => {
    const feeds: {
      hover?: (sec: number | null) => void;
      playhead?: (sec: number) => void;
    } = {};
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        registerHoverTimeListener={(listener) => {
          feeds.hover = listener;
          return vi.fn();
        }}
        registerPlayheadListener={(listener) => {
          feeds.playhead = listener;
          listener(5);
          return vi.fn();
        }}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 5, top: 0 },
      false,
    );

    feeds.hover?.(8);
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 8, top: 0 },
      false,
    );

    feeds.hover?.(null);
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 5, top: 0 },
      false,
    );

    dispatchPointer(chart.over, "pointerenter", 5, 5);
    chart.setCursor.mockClear();
    feeds.playhead?.(6);
    expect(chart.setCursor).not.toHaveBeenCalled();

    dispatchPointer(chart.over, "pointerleave", 5, 5);
    chart.over.dispatchEvent(new MouseEvent("mouseleave"));
    expect(chart.setCursor).toHaveBeenLastCalledWith(
      { left: 6, top: 0 },
      false,
    );
    unmount();
  });

  it("positions playhead and hover markers consistently across feeds and draws", () => {
    const feeds: {
      hover?: (sec: number | null) => void;
      playhead?: (sec: number) => void;
    } = {};
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        registerHoverTimeListener={(listener) => {
          feeds.hover = listener;
          return vi.fn();
        }}
        registerPlayheadListener={(listener) => {
          feeds.playhead = listener;
          return vi.fn();
        }}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();
    const playhead = screen.getByTestId("timeseries-playhead");
    const hover = screen.getByTestId("timeseries-hover-caret");

    feeds.playhead?.(5);
    expect(playhead.style.display).toBe("block");
    expect(playhead.style.transform).toBe("translateX(5px)");

    playhead.style.display = "none";
    runHooks(chart.options.hooks?.draw, chart);
    expect(playhead.style.display).toBe("block");
    expect(playhead.style.transform).toBe("translateX(5px)");

    feeds.playhead?.(21);
    expect(playhead.style.display).toBe("none");

    feeds.hover?.(6);
    expect(hover.style.display).toBe("block");
    expect(hover.style.transform).toBe("translateX(6px)");

    dispatchPointer(chart.over, "pointerenter", 0, 0);
    expect(hover.style.display).toBe("none");
    dispatchPointer(chart.over, "pointerleave", 0, 0);
    expect(hover.style.display).toBe("block");

    feeds.hover?.(null);
    expect(hover.style.display).toBe("none");
    unmount();
  });

  it("follows a quantized local window until the chart is pinned", () => {
    let publishPlayhead: ((sec: number) => void) | undefined;
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={120}
        registerPlayheadListener={(listener) => {
          publishPlayhead = listener;
          listener(60);
          return vi.fn();
        }}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const chart = lastChart();

    expect(chart.scales.x).toEqual({ min: 30, max: 90 });
    publishPlayhead?.(80);
    expect(chart.scales.x).toEqual({ min: 45, max: 105 });

    runHooks(chart.options.hooks?.setSelect, chart);
    publishPlayhead?.(100);
    expect(chart.scales.x).toEqual({ min: 45, max: 105 });
    unmount();
  });
});

const DATA = [
  [0, 20],
  [1, 2],
] as AlignedData;

function renderChart(onSeek = vi.fn(), onSeekEnd?: () => void) {
  return render(
    <TimeseriesChart
      data={DATA}
      durationSec={20}
      onSeek={onSeek}
      onSeekEnd={onSeekEnd}
      series={[{ color: "#f00", label: "speed" }]}
    />,
  );
}

function lastChart(): MockChart {
  const chart = uPlotMock.instances.at(-1);
  if (!chart) {
    throw new Error("expected a uPlot instance");
  }
  return chart;
}

function runHooks(
  hooks: MockHook | readonly MockHook[] | undefined,
  chart: MockChart,
  options?: unknown,
  data?: unknown,
): void {
  if (typeof hooks === "function") {
    hooks(chart, options, data);
    return;
  }
  for (const hook of hooks ?? []) {
    hook(chart, options, data);
  }
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1,
): void {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
}
