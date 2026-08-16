import { PlaybackProvider } from "@fiftyone/playback";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizePeaks } from "./peak-pyramid";
import WaveformViewer from "./WaveformViewer";

afterEach(cleanup);

function renderViewer(overrides: Partial<React.ComponentProps<typeof WaveformViewer>> = {}) {
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

describe("WaveformViewer", () => {
  it("renders a placeholder when WebGPU is unavailable", () => {
    const originalGpu = (navigator as { gpu?: unknown }).gpu;
    // jsdom has no `navigator.gpu` by default; ensure the branch is exercised
    // deterministically regardless of the host environment.
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
    renderViewer();
    expect(screen.getByTestId("waveform-viewer-unsupported")).toBeTruthy();
    expect(screen.queryByTestId("waveform-viewer-canvas")).toBeNull();

    Object.defineProperty(navigator, "gpu", {
      value: originalGpu,
      configurable: true,
    });
  });

  it("mounts a canvas and drives a mocked renderer without a real GPU", async () => {
    Object.defineProperty(navigator, "gpu", {
      value: {},
      configurable: true,
    });

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
