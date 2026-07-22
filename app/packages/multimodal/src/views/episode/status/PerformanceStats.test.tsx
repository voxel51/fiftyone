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

    act(() => vi.advanceTimersByTime(249));
    expect(screen.getByText("0.000 s")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("2.500 s")).toBeTruthy();
  });
});
