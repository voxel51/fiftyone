import { fireEvent, render, screen } from "@testing-library/react";
import type { AlignedData } from "uplot";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimeseriesChart from "./TimeseriesChart";

interface MockHookPlugin {
  readonly hooks: {
    readonly destroy?: MockHook | readonly MockHook[];
    readonly init?: MockHook | readonly MockHook[];
  };
}

type MockHook = (
  chart: MockChart,
  options?: MockOptions,
  data?: unknown,
) => void;

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
  readonly plugins?: readonly MockHookPlugin[];
  readonly scales?: {
    readonly x?: {
      readonly range?: readonly [number, number];
    };
  };
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
});

describe("TimeseriesChart interactions", () => {
  it("renders zoom controls and resets only from the explicit button", () => {
    const { unmount } = renderChart();
    const chart = lastChart();
    chart.setData.mockClear();

    fireEvent.click(screen.getByLabelText("Zoom in"));
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

    fireEvent.click(screen.getByLabelText("Reset zoom"));
    expect(chart.setData).toHaveBeenCalledWith(DATA, true);
    unmount();
  });

  it("configures region selection and a label-sized y-axis gutter", () => {
    const { unmount } = renderChart();
    const chart = lastChart();

    expect(chart.options.cursor?.drag).toEqual({
      dist: 4,
      setScale: true,
      x: true,
      y: true,
    });
    expect(chart.options.scales?.x?.range).toBeUndefined();

    const size = chart.options.axes?.[1]?.size;
    if (typeof size !== "function") {
      throw new Error("expected a dynamic y-axis size");
    }
    expect(size(chart, ["100000", "-123456.7"], 1, 1)).toBe(79);
    unmount();
  });

  it("keeps tap-to-seek and ignores pointer travel from a pan", () => {
    const onSeek = vi.fn();
    const { unmount } = renderChart(onSeek);
    const over = lastChart().over;

    dispatchPointer(over, "pointerdown", 5, 5);
    dispatchPointer(over, "pointerup", 5, 5);
    expect(onSeek).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(5);

    dispatchPointer(over, "pointerdown", 5, 5);
    dispatchPointer(over, "pointerup", 5, 20);
    expect(onSeek).toHaveBeenCalledOnce();

    dispatchPointer(over, "pointerdown", 5, 5, 1);
    dispatchPointer(over, "pointerdown", 15, 5, 2);
    dispatchPointer(over, "pointerup", 15, 5, 2);
    dispatchPointer(over, "pointerup", 5, 5, 1);
    expect(onSeek).toHaveBeenCalledOnce();
    unmount();
  });

  it("scrubs continuously when the playhead marker is grabbed", () => {
    const onSeek = vi.fn();
    const { unmount } = render(
      <TimeseriesChart
        data={DATA}
        durationSec={20}
        onSeek={onSeek}
        registerPlayheadListener={(listener) => {
          listener(5);
          return vi.fn();
        }}
        series={[{ color: "#f00", label: "speed" }]}
      />,
    );
    const playhead = screen.getByTestId("timeseries-playhead");

    dispatchPointer(playhead, "pointerdown", 5, 5);
    expect(playhead.className).toContain("playheadDragging");

    dispatchPointer(playhead, "pointermove", 12, 5);
    dispatchPointer(playhead, "pointermove", 15, 5);
    expect(onSeek.mock.calls).toEqual([[12], [15]]);

    dispatchPointer(playhead, "pointerup", 15, 5);
    expect(playhead.className).not.toContain("playheadDragging");
    unmount();
  });
});

const DATA = [
  [0, 20],
  [1, 2],
] as AlignedData;

function renderChart(onSeek = vi.fn()) {
  return render(
    <TimeseriesChart
      data={DATA}
      durationSec={20}
      onSeek={onSeek}
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
  options?: MockOptions,
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
