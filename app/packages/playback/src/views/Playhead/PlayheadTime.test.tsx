import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider, usePlayback } from "../../lib/playback/PlaybackProvider";
import PlayheadTime from "./PlayheadTime";

/**
 * Calls `seek(time)` once after mount so tests can drive the playhead
 * without manipulating atoms directly.
 */
function Seeker({ time }: { time: number }) {
  const { seek } = usePlayback();
  useEffect(() => {
    seek(time);
  }, [seek, time]);
  return null;
}

function renderTime(duration: number, seekTo?: number) {
  return render(
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      {seekTo !== undefined ? <Seeker time={seekTo} /> : null}
      <PlayheadTime />
    </PlaybackProvider>
  );
}

describe("PlayheadTime", () => {
  afterEach(() => cleanup());

  it("renders the initial playhead and duration formatted as 0:SS.cs", () => {
    renderTime(12);
    expect(screen.getByText("0:00.00 / 0:12.00")).toBeTruthy();
  });

  it("reflects the duration provided by the surrounding provider", () => {
    renderTime(3);
    expect(screen.getByText("0:00.00 / 0:03.00")).toBeTruthy();
  });

  it("updates the readout when the playhead is seeked", () => {
    // 4.25 is exactly representable in float, so the centi-second
    // truncation is stable.
    renderTime(10, 4.25);
    expect(screen.getByText("0:04.25 / 0:10.00")).toBeTruthy();
  });

  it("zero-pads sub-10-second values in both fields", () => {
    renderTime(7, 1.5);
    expect(screen.getByText("0:01.50 / 0:07.00")).toBeTruthy();
  });

  it("renders a single text node (currentTime / duration)", () => {
    const { container } = renderTime(8);
    // Just one <span> — the voodo Text wrapper.
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });
});
