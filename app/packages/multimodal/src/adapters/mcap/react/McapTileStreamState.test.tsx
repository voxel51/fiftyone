import { PlaybackProvider, usePlaybackStore } from "@fiftyone/playback";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  McapTileEmptyState,
  McapTileStatusBadge,
  McapTileStreamNoticeStrip,
} from "./McapTileStreamState";
import { MCAP_NOTICE_APPEARANCE_FLOOR_MS } from "./mcap-health";
import {
  setMcapTopicStartTimeSec,
  setMcapTopicStaleAgeNs,
  setMcapTopicStatus,
} from "./mcap-stream-status-state";

const TOPIC = "/camera";
const SECOND_TOPIC = "/labels";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapTileEmptyState", () => {
  it("shows a deterministic empty-source message for empty topics", () => {
    render(<McapTileEmptyState topics={[""]} />);

    expect(screen.getByTestId("mcap-tile-empty-state").textContent).toBe(
      "No source available",
    );
  });

  it("does not flash a loading indicator for a sub-threshold gap", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <McapTileEmptyState topics={[TOPIC]} />
      </PlaybackProvider>,
    );

    const indicator = screen.getByTestId("mcap-tile-loading-indicator");
    expect(indicator.dataset.visible).toBeUndefined();
    act(() => vi.advanceTimersByTime(199));
    expect(indicator.dataset.visible).toBeUndefined();
    act(() => vi.advanceTimersByTime(1));
    expect(indicator.dataset.visible).toBe("true");
  });

  it("rounds tiny positive gap starts up to the displayed centisecond", async () => {
    render(
      <PlaybackProvider>
        <SeedGap startSec={0.001} />
      </PlaybackProvider>,
    );

    expect(await screen.findByText("No data until 0:00.01")).toBeTruthy();
  });

  it("describes the age of a stale displayed frame", async () => {
    render(
      <PlaybackProvider>
        <SeedStaleBadge ageNs={2_400_000_000n} />
      </PlaybackProvider>,
    );

    expect(
      await screen.findByText("Displaying stale frame from 2.4s ago"),
    ).toBeTruthy();
  });
});

describe("McapTileStreamNoticeStrip", () => {
  it("suppresses a transient loading notice when a source is enabled", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <StreamNoticeHarness />
      </PlaybackProvider>,
    );

    act(() => screen.getByRole("button", { name: "Enable labels" }).click());
    expect(screen.queryByText(/Buffering/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(MCAP_NOTICE_APPEARANCE_FLOOR_MS - 1);
      screen.getByRole("button", { name: "Labels ready" }).click();
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText(/Buffering/)).toBeNull();
  });

  it("shows a loading notice that survives the appearance floor", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <StreamNoticeHarness />
      </PlaybackProvider>,
    );

    act(() => screen.getByRole("button", { name: "Enable labels" }).click());
    act(() => vi.advanceTimersByTime(MCAP_NOTICE_APPEARANCE_FLOOR_MS));

    expect(screen.getByText(/Buffering/)).toBeTruthy();
  });
});

function SeedGap({ startSec }: { readonly startSec: number }) {
  const store = usePlaybackStore();

  useEffect(() => {
    setMcapTopicStatus(store, TOPIC, "gap");
    setMcapTopicStartTimeSec(store, TOPIC, startSec);
  }, [startSec, store]);

  return <McapTileEmptyState topics={[TOPIC]} />;
}

function SeedStaleBadge({ ageNs }: { readonly ageNs: bigint }) {
  const store = usePlaybackStore();

  useEffect(() => {
    setMcapTopicStatus(store, TOPIC, "stale");
    setMcapTopicStaleAgeNs(store, TOPIC, ageNs);
  }, [ageNs, store]);

  return <McapTileStatusBadge topics={[TOPIC]} />;
}

function StreamNoticeHarness() {
  const store = usePlaybackStore();
  const [topics, setTopics] = useState<readonly string[]>([TOPIC]);

  useEffect(() => {
    setMcapTopicStatus(store, TOPIC, "ready");
  }, [store]);

  return (
    <>
      <button onClick={() => setTopics([TOPIC, SECOND_TOPIC])} type="button">
        Enable labels
      </button>
      <button
        onClick={() => setMcapTopicStatus(store, SECOND_TOPIC, "ready")}
        type="button"
      >
        Labels ready
      </button>
      <McapTileStreamNoticeStrip topics={topics} />
    </>
  );
}
