import {
  getPlayhead,
  PlaybackProvider,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex, type TimelineIndex } from "../../../runtime";
import {
  TileEmptyState,
  TileStatusBadge,
  TileStreamNoticeStrip,
  useTileStreamWarningNotices,
} from "./TileStreamState";
import { PanelNotices } from "../../../visualization/panel-ui/PanelNotices";
import { NOTICE_APPEARANCE_FLOOR_MS } from "../status/health";
import {
  setStreamStartTimeSec,
  setStreamStaleAgeNs,
  setStreamStatus,
} from "../playback/stream-status-state";
import {
  DataStreamProvider,
  useSetDataStream,
} from "../playback/data-stream-context";

const STREAM = "/camera";
const SECOND_STREAM = "/labels";

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
    expect(screen.queryByRole("button", { name: "Jump to data" })).toBeNull();
  });

  it("jumps long gaps to the first timeline tick with data", async () => {
    const timeline = createTimelineIndex({
      endNs: 2_000_000_000n,
      startNs: 0n,
    });
    const storeCapture: { current: PlaybackStore | null } = { current: null };
    render(
      <PlaybackProvider duration={2}>
        <DataStreamProvider>
          <SeedJumpGap
            onStore={(value) => {
              storeCapture.current = value;
            }}
            startSec={0.6}
            timeline={timeline}
          />
        </DataStreamProvider>
      </PlaybackProvider>,
    );

    expect(await screen.findByText("Starts at 0:00.60")).toBeTruthy();
    const jump = screen.getByRole("button", { name: "Jump to data" });
    act(() => jump.click());

    const targetTick = timeline.tickAt(
      timeline.indexAtOrAfter(timeline.secToNs(0.6)),
    );
    expect(targetTick).toBeDefined();
    const store = storeCapture.current;
    if (!store || targetTick === undefined) {
      throw new Error("Jump-to-data test did not capture playback state");
    }
    expect(getPlayhead(store)).toBeCloseTo(timeline.nsToSec(targetTick), 6);
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

  it("routes stale warnings through the panel notice control", () => {
    vi.useFakeTimers();
    render(
      <PlaybackProvider>
        <SeedStalePanelNotice ageNs={2_400_000_000n} />
      </PlaybackProvider>,
    );

    act(() => vi.advanceTimersByTime(NOTICE_APPEARANCE_FLOOR_MS));
    expect(screen.queryByTestId("episode-tile-status-badge")).toBeNull();

    const noticeButton = screen.getByRole("button", {
      name: "1 image notice",
    });
    act(() => noticeButton.click());
    expect(
      screen.getByText("Displaying stale frame from 2.4s ago"),
    ).toBeTruthy();
  });
});

describe("TileStreamNoticeStrip", () => {
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
      vi.advanceTimersByTime(NOTICE_APPEARANCE_FLOOR_MS - 1);
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
    act(() => vi.advanceTimersByTime(NOTICE_APPEARANCE_FLOOR_MS));

    expect(screen.getByText(/Buffering/)).toBeTruthy();
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

function SeedJumpGap({
  onStore,
  startSec,
  timeline,
}: {
  readonly onStore: (store: PlaybackStore) => void;
  readonly startSec: number;
  readonly timeline: TimelineIndex;
}) {
  const store = usePlaybackStore();
  const setDataStream = useSetDataStream();

  useEffect(() => {
    setDataStream({
      getStreamCache: () => undefined,
      getTimelineIndex: () => timeline,
      sourceKey: "jump-gap-test",
      subscribeToStream: () => () => undefined,
    });
    return () => setDataStream(null);
  }, [setDataStream, timeline]);

  useEffect(() => {
    onStore(store);
    setStreamStatus(store, STREAM, "gap");
    setStreamStartTimeSec(store, STREAM, startSec);
  }, [onStore, startSec, store]);

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

function SeedStalePanelNotice({ ageNs }: { readonly ageNs: bigint }) {
  const store = usePlaybackStore();
  const notices = useTileStreamWarningNotices([STREAM]);

  // This effect seeds stale metadata for the panel-local warning test.
  useEffect(() => {
    setStreamStatus(store, STREAM, "stale");
    setStreamStaleAgeNs(store, STREAM, ageNs);
  }, [ageNs, store]);

  return (
    <>
      <PanelNotices notices={notices} scope="image" />
      <TileStatusBadge showWarnings={false} streams={[STREAM]} />
    </>
  );
}

function StreamNoticeHarness() {
  const store = usePlaybackStore();
  const [streams, setStreams] = useState<readonly string[]>([STREAM]);

  // This effect starts the existing source ready before toggling a new one.
  useEffect(() => {
    setStreamStatus(store, STREAM, "ready");
  }, [store]);

  return (
    <>
      <button onClick={() => setStreams([STREAM, SECOND_STREAM])} type="button">
        Enable labels
      </button>
      <button
        onClick={() => setStreamStatus(store, SECOND_STREAM, "ready")}
        type="button"
      >
        Labels ready
      </button>
      <TileStreamNoticeStrip streams={streams} />
    </>
  );
}
