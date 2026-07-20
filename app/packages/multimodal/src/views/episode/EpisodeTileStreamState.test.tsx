import { PlaybackProvider, usePlaybackStore } from "@fiftyone/playback";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EpisodeTileEmptyState,
  EpisodeTileStatusBadge,
} from "./EpisodeTileStreamState";
import {
  setEpisodeStreamStartTimeSec,
  setEpisodeStreamStaleAgeNs,
  setEpisodeStreamStatus,
} from "./episode-stream-status-state";

const STREAM = "/camera";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EpisodeTileEmptyState", () => {
  it("shows a deterministic empty-source message for empty streams", () => {
    render(<EpisodeTileEmptyState streams={[""]} />);

    expect(screen.getByTestId("episode-tile-empty-state").textContent).toBe(
      "No source available",
    );
  });

  it("does not flash a loading indicator for a sub-threshold gap", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <EpisodeTileEmptyState streams={[STREAM]} />
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
});

function SeedGap({ startSec }: { readonly startSec: number }) {
  const store = usePlaybackStore();

  useEffect(() => {
    setEpisodeStreamStatus(store, STREAM, "gap");
    setEpisodeStreamStartTimeSec(store, STREAM, startSec);
  }, [startSec, store]);

  return <EpisodeTileEmptyState streams={[STREAM]} />;
}

function SeedStaleBadge({ ageNs }: { readonly ageNs: bigint }) {
  const store = usePlaybackStore();

  useEffect(() => {
    setEpisodeStreamStatus(store, STREAM, "stale");
    setEpisodeStreamStaleAgeNs(store, STREAM, ageNs);
  }, [ageNs, store]);

  return <EpisodeTileStatusBadge streams={[STREAM]} />;
}
