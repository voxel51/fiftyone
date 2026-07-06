import { PlaybackProvider } from "@fiftyone/playback";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
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
  formatMcapTimeZoneOption,
  formatMcapWallClock,
  getMcapInferredTimeZone,
  getMcapTimeZoneFromPath,
  getMcapTimeZoneOptions,
  getMcapTimeZonePath,
  isPlausibleEpochNs,
  searchMcapTimeZones,
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

  it("formats the same instant in a selected timezone", () => {
    expect(formatMcapWallClock(EPOCH_START_NS, "America/Los_Angeles")).toBe(
      "07:03:22.123 America/Los_Angeles",
    );
  });

  it("exposes searchable timezone options with the inferred timezone first", () => {
    expect(getMcapTimeZoneOptions()[0]).toBe(getMcapInferredTimeZone());
    expect(searchMcapTimeZones("utc")).toContain("UTC");
    expect(searchMcapTimeZones("los angeles")).toContain("America/Los_Angeles");
  });

  it("formats timezone options with GMT offsets", () => {
    expect(formatMcapTimeZoneOption("UTC", EPOCH_START_NS)).toBe(
      "UTC (GMT+00:00)",
    );
    expect(
      formatMcapTimeZoneOption("America/Los_Angeles", EPOCH_START_NS),
    ).toBe("America/Los_Angeles (GMT-07:00)");
  });

  it("round-trips Voodo timezone selection paths", () => {
    const targetTimeZone = "Africa/Addis_Ababa";
    const path = getMcapTimeZonePath(targetTimeZone, EPOCH_START_NS);

    expect(path).toEqual(["timezones", targetTimeZone]);
    expect(getMcapTimeZoneFromPath(path ?? null, EPOCH_START_NS)).toBe(
      targetTimeZone,
    );
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

function getByCy(container: HTMLElement, cy: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-cy="${cy}"]`);
  expect(element).toBeTruthy();
  return element as HTMLElement;
}

function getTimezoneTrigger(container: HTMLElement): HTMLInputElement {
  const picker = getByCy(container, "mcap-timezone-picker");
  const input = picker.querySelector<HTMLInputElement>(
    'input[role="combobox"]',
  );
  expect(input).toBeTruthy();
  return input as HTMLInputElement;
}

describe("McapTimestampReadout", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the recording wall clock at the playhead", () => {
    const { container } = renderReadout(EPOCH_START_NS);
    const readout = getByCy(container, "mcap-timestamp-readout");

    expect(getByCy(container, "mcap-timestamp-copy").textContent).toBe(
      "14:03:22.123",
    );
    expect(
      readout.querySelector<HTMLInputElement>(
        '[data-cy="mcap-timezone-picker"] input[role="combobox"]',
      )?.value,
    ).toBe("UTC");
  });

  it("opens the Voodo timezone picker with focused search", async () => {
    const { container } = renderReadout(EPOCH_START_NS);
    fireEvent.click(getTimezoneTrigger(container));

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search tree"]',
    );

    expect(searchInput).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(searchInput));
  });

  it("updates the timezone token and wall-clock value for a selected timezone", () => {
    const targetTimeZone = "Africa/Addis_Ababa";
    const path = getMcapTimeZonePath(targetTimeZone, EPOCH_START_NS);

    expect(getMcapTimeZoneFromPath(path ?? null, EPOCH_START_NS)).toBe(
      targetTimeZone,
    );
    expect(formatMcapWallClock(EPOCH_START_NS, targetTimeZone)).toBe(
      "17:03:22.123 Africa/Addis_Ababa",
    );
  });

  it("renders nothing for sim-time recordings", () => {
    const { container } = renderReadout(0n);
    expect(container.querySelector('[data-cy="mcap-timestamp-readout"]')).toBe(
      null,
    );
  });

  it("copies the full-precision timestamp and flashes feedback", () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = renderReadout(EPOCH_START_NS);
    fireEvent.click(getByCy(container, "mcap-timestamp-copy"));

    expect(writeText).toHaveBeenCalledWith(
      "2019-09-18T14:03:22.123456789Z (1568815402123456789 ns)",
    );
    expect(getByCy(container, "mcap-timestamp-copy").textContent).toBe(
      "Copied",
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(getByCy(container, "mcap-timestamp-copy").textContent).toBe(
      "14:03:22.123",
    );
  });

  it("copies from the clock button without opening the timezone selector", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = renderReadout(EPOCH_START_NS);
    fireEvent.click(getByCy(container, "mcap-timestamp-copy"));
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
