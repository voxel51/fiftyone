import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizePeaks } from "../../../audio/peak-pyramid";
import WaveformViewer from "./WaveformViewer";

afterEach(cleanup);

function renderViewer(
  overrides: Partial<React.ComponentProps<typeof WaveformViewer>> = {},
) {
  const track = {
    trackId: "a",
    label: "Track A",
    pyramid: synthesizePeaks({ durationSec: 1, sampleRate: 1000 }),
  };
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <WaveformViewer tracks={[track]} {...overrides} />
    </PlaybackProvider>,
  );
}

/** Stubs `navigator.gpu`; jsdom has none, so every case sets it explicitly. */
function setGpu(value: unknown) {
  Object.defineProperty(navigator, "gpu", { value, configurable: true });
}

describe("WaveformViewer", () => {
  // Captured once and restored after every case: a stub left behind would
  // silently leak into any test added after these.
  const originalGpu = (navigator as { gpu?: unknown }).gpu;
  afterEach(() => setGpu(originalGpu));

  it("renders a placeholder when WebGPU is unavailable", () => {
    setGpu(undefined);
    renderViewer();
    expect(screen.getByTestId("waveform-viewer-unsupported")).toBeTruthy();
    expect(screen.queryByTestId("waveform-viewer-canvas")).toBeNull();
  });

  it("shows the placeholder when the renderer fails to initialize", async () => {
    setGpu({});
    const createRenderer = vi.fn(async () => {
      throw new Error("no adapter");
    });
    renderViewer({ createRenderer });
    // `navigator.gpu` exists, so without a rejection handler this would be
    // an unhandled rejection and a permanently blank canvas.
    await waitFor(() =>
      expect(screen.getByTestId("waveform-viewer-unsupported")).toBeTruthy(),
    );
  });

  it("mounts a canvas and drives a mocked renderer without a real GPU", async () => {
    setGpu({});

    const render_ = vi.fn();
    const dispose = vi.fn();
    const createRenderer = vi.fn(async () => ({ render: render_, dispose }));

    renderViewer({ createRenderer });

    expect(screen.getByTestId("waveform-viewer-canvas")).toBeTruthy();
    await waitFor(() => expect(createRenderer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(render_).toHaveBeenCalled());

    const call = render_.mock.calls[0][0];
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0].trackId).toBe("a");
  });
});
