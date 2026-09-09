import { PlaybackProvider, usePlayback } from "@fiftyone/playback";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PerformanceStats from "./PerformanceStats";
import {
  registerGraphicsRenderer,
  resetGraphicsRendererRegistryForTests,
} from "../../../visualization/webgpu/graphics-renderer-registry";

type Playback = ReturnType<typeof usePlayback>;

let clipboardDescriptor: PropertyDescriptor | undefined;

function PlaybackProbe({
  playbackRef,
}: {
  readonly playbackRef: { current: Playback | null };
}) {
  playbackRef.current = usePlayback();
  return null;
}

describe("PerformanceStats", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    clipboardDescriptor = undefined;
    window.history.replaceState(null, "", window.location.pathname);
    resetGraphicsRendererRegistryForTests();
  });

  it("samples the visible playhead but copies the latest committed time", async () => {
    vi.useFakeTimers({ toFake: ["clearTimeout", "setTimeout"] });
    const writeText = vi.fn(async (_text: string) => undefined);
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.assign(navigator, { clipboard: { writeText } });
    const playbackRef: { current: Playback | null } = { current: null };

    render(
      <PlaybackProvider duration={10}>
        <PlaybackProbe playbackRef={playbackRef} />
        <PerformanceStats sampling={null} />
      </PlaybackProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(screen.getByText("0.000 s")).toBeTruthy();
    act(() => playbackRef.current?.play());
    expect(screen.getByText("Playing")).toBeTruthy();
    act(() => playbackRef.current?.pause());
    expect(screen.getByText("Paused")).toBeTruthy();

    act(() => {
      playbackRef.current?.seek(1.25);
      playbackRef.current?.seek(2.5);
    });

    // Rapid playback commits do not immediately update the diagnostics UI.
    expect(screen.getByText("0.000 s")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0]).playback.currentTimeSec).toBe(
      2.5,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(249));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("0.000 s")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("2.500 s")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1_249));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeTruthy();
  });

  it("shows and copies the actual graphics backend instead of renderer labels", async () => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?graphicsBackend=webgl2`,
    );
    const registration = registerGraphicsRenderer("modal-3d");
    registration.markReady("webgl2");
    const writeText = vi.fn(async (_text: string) => undefined);
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <PlaybackProvider duration={10}>
        <PerformanceStats sampling={null} />
      </PlaybackProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(screen.getByText("Graphics")).toBeTruthy();
    expect(screen.getByText("WebGL2 (diagnostic override)")).toBeTruthy();
    expect(
      screen.getByText("0 WebGPU / 1 WebGL2 / 0 initializing"),
    ).toBeTruthy();
    expect(screen.getByText("Surface · modal-3d")).toBeTruthy();
    expect(screen.getByText("1 WebGL2")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
      await Promise.resolve();
    });
    const snapshot = JSON.parse(writeText.mock.calls[0][0]);
    expect(snapshot.webGpu).toBeUndefined();
    expect(snapshot.graphics).toMatchObject({
      renderers: {
        byBackend: { webgl2: 1, webgpu: 0 },
        bySurface: {
          "modal-3d": { initializing: 0, webgl2: 1, webgpu: 0 },
        },
        webGlFallbacks: 0,
        webGlOverrides: 1,
      },
      requestedBackend: "webgl2",
      requestedPowerPreference: "high-performance",
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });
});
