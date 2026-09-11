// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsView, type EmbeddingsViewHandle } from "./EmbeddingsView";
import type { EmbeddingsChartCallbacks } from "./EmbeddingsChart";
import type { EmbeddingPoint } from "./types";

// The chart needs a real WebGL context; for wrapper plumbing tests a
// call recorder is the whole point
const instances: MockChart[] = [];
class MockChart {
  setData = vi.fn();
  setColors = vi.fn();
  setVisible = vi.fn();
  setSelected = vi.fn();
  clearSelection = vi.fn();
  setRenderSettings = vi.fn();
  setInteractionMode = vi.fn();
  resetCamera = vi.fn();
  projectPoint = vi.fn(() => ({ x: 12, y: 34 }));
  destroy = vi.fn();
  readonly callbacks: EmbeddingsChartCallbacks;
  constructor(_host: HTMLElement, callbacks: EmbeddingsChartCallbacks) {
    this.callbacks = callbacks;
    instances.push(this);
  }
}
vi.mock("./EmbeddingsChart", () => ({ EmbeddingsChart: MockChart }));

// Stale instances let a test observe the PREVIOUS test's chart before
// its own lazy import resolves
beforeEach(() => {
  instances.length = 0;
});

const POINTS: EmbeddingPoint[] = [
  { id: "a", x: 0, y: 0, label: null },
  { id: "b", x: 1, y: 1, label: null },
];

describe("EmbeddingsView prop plumbing", () => {
  it("forwards data, visibility, and selection to the chart in order", async () => {
    const visible = new Uint8Array([1, 0]);
    render(<EmbeddingsView points={POINTS} visible={visible} selected={[1]} />);

    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];

    await waitFor(() => expect(chart.setVisible).toHaveBeenCalled());
    expect(chart.setData).toHaveBeenCalledWith(POINTS);
    expect(chart.setVisible).toHaveBeenLastCalledWith(visible);
    expect(chart.setSelected).toHaveBeenLastCalledWith([1]);

    // setData must precede setVisible (setData resets the mask)
    const dataOrder = chart.setData.mock.invocationCallOrder[0];
    const visibleOrder =
      chart.setVisible.mock.invocationCallOrder[
        chart.setVisible.mock.calls.length - 1
      ];
    expect(dataOrder).toBeLessThan(visibleOrder);
  });

  it("applies a visibility mask that arrives after mount", async () => {
    const { rerender } = render(<EmbeddingsView points={POINTS} />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];
    await waitFor(() => expect(chart.setData).toHaveBeenCalled());

    const visible = new Uint8Array([0, 1]);
    rerender(<EmbeddingsView points={POINTS} visible={visible} />);
    await waitFor(() =>
      expect(chart.setVisible).toHaveBeenLastCalledWith(visible),
    );
  });

  it("exposes camera reset and selection clearing through the handle", async () => {
    const ref = { current: null as null | EmbeddingsViewHandle };
    render(<EmbeddingsView ref={ref} points={POINTS} />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];
    await waitFor(() => expect(ref.current).not.toBeNull());

    ref.current?.resetCamera();
    expect(chart.resetCamera).toHaveBeenCalled();

    ref.current?.clearSelection();
    // The explicit clear drops both layers, not just the host one
    expect(chart.clearSelection).toHaveBeenCalled();

    // Host chrome anchored to a point asks the chart where that point is
    // NOW; the wrapper holds no coordinates of its own
    expect(ref.current?.projectPoint(1)).toEqual({ x: 12, y: 34 });
    expect(chart.projectPoint).toHaveBeenCalledWith(1);
  });

  it("answers no position through a handle whose chart has not loaded", async () => {
    // The lazy chunk lands a tick after mount; chrome that asks in between
    // must get "nowhere", never a stale or invented pixel
    const ref = { current: null as null | EmbeddingsViewHandle };
    render(<EmbeddingsView ref={ref} points={POINTS} />);

    expect(ref.current?.projectPoint(0)).toBeNull();
  });

  it("tells the host when the camera moves", async () => {
    // A point-anchored ring only follows if the host hears about the move
    const onCameraChange = vi.fn();
    render(<EmbeddingsView points={POINTS} onCameraChange={onCameraChange} />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];

    chart.callbacks.onCameraChange?.();

    expect(onCameraChange).toHaveBeenCalled();
  });

  it("forwards mode changes to the chart", async () => {
    const { rerender } = render(
      <EmbeddingsView points={POINTS} mode="explore" />,
    );
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];

    await waitFor(() =>
      expect(chart.setInteractionMode).toHaveBeenLastCalledWith("explore"),
    );
    rerender(<EmbeddingsView points={POINTS} mode="select" />);
    await waitFor(() =>
      expect(chart.setInteractionMode).toHaveBeenLastCalledWith("select"),
    );
  });

  // Color-by None must not leave the previous field's colors on the GPU
  it("restores the default palette when colors clear", async () => {
    const colors = new Float32Array(POINTS.length * 3);
    const { rerender } = render(
      <EmbeddingsView points={POINTS} colors={colors} />,
    );
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];
    await waitFor(() =>
      expect(chart.setColors).toHaveBeenLastCalledWith(colors),
    );

    rerender(<EmbeddingsView points={POINTS} colors={null} />);
    await waitFor(() => expect(chart.setColors).toHaveBeenLastCalledWith(null));
  });

  it("forwards shared cell-ordinal membership without materializing a mask", async () => {
    // A facet layout shares ONE ordinal array across cells; the chart fills
    // its own GPU mask from it, so no per-cell Uint8Array is ever built here
    const ordinals = Int16Array.from([2, 5]);
    render(
      <EmbeddingsView points={POINTS} visible={{ ordinals, ordinal: 5 }} />,
    );
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];

    await waitFor(() => expect(chart.setVisible).toHaveBeenCalled());
    expect(chart.setVisible).toHaveBeenLastCalledWith({ ordinals, ordinal: 5 });
  });

  it("drops stale cell-ordinal membership whose length mismatches", async () => {
    const { rerender } = render(<EmbeddingsView points={POINTS} />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];
    await waitFor(() => expect(chart.setData).toHaveBeenCalled());
    chart.setVisible.mockClear();

    rerender(
      <EmbeddingsView
        points={POINTS}
        visible={{ ordinals: Int16Array.from([0, 1, 0]), ordinal: 0 }}
      />,
    );
    expect(chart.setVisible).not.toHaveBeenCalled();
  });

  it("drops a stale mask whose length mismatches the points", async () => {
    const { rerender } = render(<EmbeddingsView points={POINTS} />);
    await waitFor(() => expect(instances.length).toBeGreaterThan(0));
    const chart = instances[instances.length - 1];
    await waitFor(() => expect(chart.setData).toHaveBeenCalled());
    chart.setVisible.mockClear();

    rerender(
      <EmbeddingsView points={POINTS} visible={new Uint8Array([1, 0, 1])} />,
    );
    // Length mismatch: neither applied nor cleared
    expect(chart.setVisible).not.toHaveBeenCalled();
  });
});
