import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PlaybackProvider,
  usePlayback,
} from "../../lib/playback/PlaybackProvider";
import type { TimelineMode } from "../../lib/playback/types";
import { useStepInterval } from "../../lib/playback/use-playback-state";
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

function renderTime(
  duration: number,
  seekTo?: number,
  mode?: TimelineMode,
  defaultDisplay?: "configured" | "duration",
) {
  return render(
    <PlaybackProvider
      duration={duration}
      stepInterval={1 / 30}
      mode={mode}
      defaultDisplay={defaultDisplay}
    >
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

  it("renders date-qualified wall-clock time in absolute mode", () => {
    renderTime(2, 1, { kind: "absolute", epochAnchorMs: 10_000 });
    expect(
      screen.getByText("1970-01-01 00:00:11.000 / 1970-01-01 00:00:12.000"),
    ).toBeTruthy();
  });

  /**
   * The readout doubles as the control that swaps the ruler's domain — it is
   * what replaced the looker's "use frame number" preference.
   *
   * The load-bearing property is that only the DISPLAY moves: the engine's
   * clock domain and `stepInterval` stay pinned to the configured mode, so
   * stepping is still one frame per press while the ruler reads seconds.
   * Without the last test here, swapping the two branches in
   * `useTimelineModeControl` would go unnoticed.
   */
  describe("display toggle", () => {
    it("is a button in sequence mode", () => {
      renderTime(1, 0.5, { kind: "sequence", fps: 10 });
      expect(screen.queryByRole("button")).toBeTruthy();
    });

    it("is NOT a button in duration mode — there is nothing to swap to", () => {
      renderTime(12);
      expect(screen.queryByRole("button")).toBeNull();
    });

    it("swaps frame numbers for elapsed time and back", () => {
      renderTime(1, 0.5, { kind: "sequence", fps: 10 });
      expect(screen.getByText("#5 / #10")).toBeTruthy();

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("0:00.50 / 0:01.00")).toBeTruthy();

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("#5 / #10")).toBeTruthy();
    });

    it("opens on timecode when defaultDisplay is duration", () => {
      renderTime(1, 0.5, { kind: "sequence", fps: 10 }, "duration");
      expect(screen.getByText("0:00.50 / 0:01.00")).toBeTruthy();

      // Still swappable: the CONFIGURED mode is still `sequence`.
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("#5 / #10")).toBeTruthy();
    });

    it("leaves the step interval alone across a toggle", () => {
      const steps: number[] = [];

      function Probe() {
        steps.push(useStepInterval());
        return null;
      }

      render(
        <PlaybackProvider
          duration={1}
          stepInterval={1 / 30}
          mode={{ kind: "sequence", fps: 10 }}
        >
          <PlayheadTime />
          <Probe />
        </PlaybackProvider>,
      );

      const before = steps[steps.length - 1];
      fireEvent.click(screen.getByRole("button"));
      const after = steps[steps.length - 1];

      expect(after).toBe(before);
    });
  });
});
