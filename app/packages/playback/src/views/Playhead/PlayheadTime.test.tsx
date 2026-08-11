import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PlaybackProvider,
  usePlayback,
} from "../../lib/playback/PlaybackProvider";
import type { TimelineMode } from "../../lib/playback/types";
import PlayheadTime from "./PlayheadTime";

/**
 * Calls `seek(time)` once after mount so tests can drive the playhead
 * without manipulating atoms directly.
 */
function Seeker({ time }: { time: number }) {
  const { seek } = usePlayback();
  useEffect(() => {
    seek(time);
    // seek from usePlayback() is a referentially-stable Jotai setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);
  return null;
}

function renderTime(duration: number, seekTo?: number, mode?: TimelineMode) {
  return render(
    <PlaybackProvider duration={duration} stepInterval={1 / 30} mode={mode}>
      {seekTo !== undefined ? <Seeker time={seekTo} /> : null}
      <PlayheadTime />
    </PlaybackProvider>,
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

  it("rolls over to minutes once the playhead crosses 60s", () => {
    // 83.45s = 1:23.45 — locks in M:SS.cs formatting past the minute mark.
    renderTime(120, 83.45);
    expect(screen.getByText("1:23.45 / 2:00.00")).toBeTruthy();
  });

  it("renders a single text node (currentTime / duration)", () => {
    const { container } = renderTime(8);
    // Just one <span> — the voodo Text wrapper.
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  it("renders frame numbers in sequence mode", () => {
    // 10fps -> step 0.1s; playhead 0.5s = frame 5, duration 1s = frame 10.
    renderTime(1, 0.5, { kind: "sequence", fps: 10 });
    expect(screen.getByText("#5 / #10")).toBeTruthy();
  });

  it("renders wall-clock time in absolute mode", () => {
    renderTime(2, 1, { kind: "absolute", epochAnchorMs: 10_000 });
    expect(screen.getByText("00:00:11.000 / 00:00:12.000")).toBeTruthy();
  });
});
