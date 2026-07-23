import { PlaybackProvider, usePlaybackStore } from "@fiftyone/playback";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TileEmptyState, TileStatusBadge } from "./TileStreamState";
import {
  setStreamStartTimeSec,
  setStreamStaleAgeNs,
  setStreamStatus,
} from "../playback/stream-status-state";

const STREAM = "/camera";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TileEmptyState", () => {
  it("shows a deterministic empty-source message for empty streams", () => {
    render(<TileEmptyState streams={[""]} />);

    expect(screen.getByTestId("episode-tile-empty-state").textContent).toBe(
      "No source available",
    );
  });

  it("does not flash a loading indicator for a sub-threshold gap", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <TileEmptyState streams={[STREAM]} />
      </PlaybackProvider>,
    );

    const indicator = screen.getByTestId("episode-tile-loading-indicator");
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

  it("can keep stale warnings out of tile chrome", () => {
    render(
      <PlaybackProvider>
        <SeedStaleBadge ageNs={2_400_000_000n} showWarnings={false} />
      </PlaybackProvider>,
    );

    expect(screen.queryByTestId("episode-tile-status-badge")).toBeNull();
    expect(screen.queryByText(/Displaying stale frame/)).toBeNull();
  });

  it("keeps non-warning stream status in tile chrome", () => {
    render(
      <PlaybackProvider>
        <TileStatusBadge showWarnings={false} streams={[STREAM]} />
      </PlaybackProvider>,
    );

    expect(screen.getByText("Buffering")).toBeTruthy();
  });
});

function SeedGap({ startSec }: { readonly startSec: number }) {
  const store = usePlaybackStore();

  // This effect seeds a gap state in the playback store for the empty-state test.
  useEffect(() => {
    setStreamStatus(store, STREAM, "gap");
    setStreamStartTimeSec(store, STREAM, startSec);
  }, [startSec, store]);

  return <TileEmptyState streams={[STREAM]} />;
}

function SeedStaleBadge({
  ageNs,
  showWarnings,
}: {
  readonly ageNs: bigint;
  readonly showWarnings?: boolean;
}) {
  const store = usePlaybackStore();

  // This effect seeds stale metadata in the playback store for the badge test.
  useEffect(() => {
    setStreamStatus(store, STREAM, "stale");
    setStreamStaleAgeNs(store, STREAM, ageNs);
  }, [ageNs, store]);

  return <TileStatusBadge showWarnings={showWarnings} streams={[STREAM]} />;
}
