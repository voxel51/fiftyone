import { PlaybackProvider } from "@fiftyone/playback";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  McapDataStreamProvider,
  useSetMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import McapTimestampReadout, {
  formatMcapTimestampCopyText,
  formatMcapWallClock,
  isPlausibleEpochNs,
} from "./McapTimestampReadout";

// 2019-09-18T14:03:22.123456789Z — a nuScenes-era epoch timestamp.
const EPOCH_START_NS = 1_568_815_402_123_456_789n;

describe("timestamp formatting helpers", () => {
  it("gates wall-clock display on a plausible epoch", () => {
    expect(isPlausibleEpochNs(EPOCH_START_NS)).toBe(true);
    // Sim time: recordings that start near zero.
    expect(isPlausibleEpochNs(0n)).toBe(false);
    expect(isPlausibleEpochNs(12_000_000_000n)).toBe(false);
    // Corrupt/mis-scaled stamps far past any real recording date.
    expect(isPlausibleEpochNs(5_000_000_000_000_000_000n)).toBe(false);
  });

  it("formats a compact UTC wall clock", () => {
    expect(formatMcapWallClock(EPOCH_START_NS)).toBe("14:03:22.123 UTC");
  });

  it("copies full nanosecond precision in both ISO and raw forms", () => {
    expect(formatMcapTimestampCopyText(EPOCH_START_NS)).toBe(
      "2019-09-18T14:03:22.123456789Z (1568815402123456789 ns)",
    );
  });

  it("pads sub-second fractions to nine digits", () => {
    expect(formatMcapTimestampCopyText(1_568_815_402_000_000_005n)).toBe(
      "2019-09-18T14:03:22.000000005Z (1568815402000000005 ns)",
    );
  });
});

function fakeDataStream(startTimeNs: bigint): McapDataStream {
  const endTimeNs = startTimeNs + 10_000_000_000n;
  const index: McapTimelineIndex = {
    durationSec: 10,
    endTimeNs,
    nearestTick: () => startTimeNs,
    secToNs: (timeSec) => startTimeNs + BigInt(Math.round(timeSec * 1e9)),
    startTimeNs,
    ticks: [],
  };
  return {
    getTimelineIndex: () => index,
    getTopicCache: () => undefined,
    sourceKey: "test",
    subscribeToTopic: () => () => undefined,
  };
}

const PublishDataStream: React.FC<{ readonly stream: McapDataStream }> = ({
  stream,
}) => {
  const setDataStream = useSetMcapDataStream();
  // This effect publishes the fake stream handle like the real setup hook.
  useEffect(() => {
    setDataStream(stream);
    return () => setDataStream(null);
  }, [setDataStream, stream]);
  return null;
};

function renderReadout(startTimeNs: bigint) {
  return render(
    <PlaybackProvider duration={10} stepInterval={1 / 30}>
      <McapDataStreamProvider>
        <PublishDataStream stream={fakeDataStream(startTimeNs)} />
        <McapTimestampReadout />
      </McapDataStreamProvider>
    </PlaybackProvider>,
  );
}

describe("McapTimestampReadout", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the recording wall clock at the playhead", () => {
    renderReadout(EPOCH_START_NS);
    expect(screen.getByTestId("mcap-timestamp-readout").textContent).toBe(
      "14:03:22.123 UTC",
    );
  });

  it("renders nothing for sim-time recordings", () => {
    renderReadout(0n);
    expect(screen.queryByTestId("mcap-timestamp-readout")).toBeNull();
  });

  it("copies the full-precision timestamp and flashes feedback", () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderReadout(EPOCH_START_NS);
    fireEvent.click(screen.getByTestId("mcap-timestamp-readout"));

    expect(writeText).toHaveBeenCalledWith(
      "2019-09-18T14:03:22.123456789Z (1568815402123456789 ns)",
    );
    expect(screen.getByTestId("mcap-timestamp-readout").textContent).toBe(
      "Copied",
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId("mcap-timestamp-readout").textContent).toBe(
      "14:03:22.123 UTC",
    );
  });

  it("copies via the keyboard as well", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderReadout(EPOCH_START_NS);
    fireEvent.keyDown(screen.getByTestId("mcap-timestamp-readout"), {
      key: "Enter",
    });
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
