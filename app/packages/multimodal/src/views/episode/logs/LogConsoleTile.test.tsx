import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LogConsoleTile from "./LogConsoleTile";

const mocks = vi.hoisted(() => {
  let releaseRead: () => void = () => undefined;
  let readGate: Promise<void>;
  let readFrames: readonly unknown[] = [];
  let playheadSubscriber: () => void = () => undefined;
  const resetReadGate = () => {
    readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
  };
  resetReadGate();
  const nearestTick = vi.fn((seconds: number) =>
    BigInt(Math.round(seconds * 1_000_000_000)),
  );
  const read = vi.fn(async function* (_request: {
    readonly signal?: AbortSignal;
  }) {
    await readGate;
    if (readFrames.length > 0) {
      yield { frames: readFrames, stream: "/rosout" };
    }
  });
  const timelineIndex = {
    nearestTick,
    nsToSec: (timeNs: bigint) => Number(timeNs) / 1_000_000_000,
    startTimeNs: 0n,
  };
  let session: {
    readonly manifest?: {
      readonly timeRange: { readonly endNs: bigint; readonly startNs: bigint };
    };
    readonly read: typeof read;
  } = { read };
  let budgetAccount: unknown = null;
  return {
    get budgetAccount() {
      return budgetAccount;
    },
    dataStream: {
      getTimelineIndex: () => timelineIndex,
    },
    getPlayhead: vi.fn(() => 1),
    logSources: [{ id: "/rosout", label: "ROS logs" }],
    nearestTick,
    playbackStore: {},
    read,
    releaseRead: () => releaseRead(),
    resetReadGate,
    resetSession: (timeRange?: {
      readonly endNs: bigint;
      readonly startNs: bigint;
    }) => {
      session = timeRange ? { manifest: { timeRange }, read } : { read };
    },
    runPlayheadSubscriber: () => playheadSubscriber(),
    setBudgetAccount: (account: unknown) => {
      budgetAccount = account;
    },
    setReadFrames: (frames: readonly unknown[]) => {
      readFrames = frames;
    },
    get session() {
      return session;
    },
    seek: vi.fn(),
    setLogSettings: vi.fn(),
    setTileTitle: vi.fn(),
    source: { sourceId: "logs", url: "memory://logs" },
    subscribePlayhead: vi.fn((_store, subscriber: () => void) => {
      playheadSubscriber = subscriber;
      return vi.fn();
    }),
  };
});

vi.mock("@fiftyone/playback", () => ({
  getPlayhead: mocks.getPlayhead,
  subscribePlayhead: mocks.subscribePlayhead,
  usePlayback: () => ({ seek: mocks.seek }),
  usePlaybackStore: () => mocks.playbackStore,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
}));

vi.mock("@voxel51/voodo", () => ({
  Checkbox: ({ label }: { readonly label: string }) => <span>{label}</span>,
}));

vi.mock("../../../scene-inventory/react", () => ({
  useSceneSourcesByType: () => mocks.logSources,
}));

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => mocks.dataStream,
}));

vi.mock("../playback/bulk-stream-lifecycle", () => ({
  shouldDeferBulkHistory: () => false,
}));

vi.mock("./log-console-context", () => ({
  useLogConsoleContext: () => ({
    budgetAccount: mocks.budgetAccount,
    session: mocks.session,
    sourceKey: mocks.source.sourceId,
  }),
}));

vi.mock("./log-tile-state", () => ({
  useLogTileSettings: () => ({
    followPlayhead: true,
    selectedLevels: ["info"],
  }),
  useSetLogTileSettings: () => mocks.setLogSettings,
}));

beforeEach(() => {
  mocks.setBudgetAccount(null);
  mocks.resetReadGate();
  mocks.resetSession();
  mocks.setReadFrames([]);
  mocks.read.mockClear();
  mocks.nearestTick.mockClear();
  mocks.getPlayhead.mockReset();
  mocks.getPlayhead.mockReturnValue(1);
  mocks.seek.mockClear();
  mocks.subscribePlayhead.mockClear();
});

afterEach(() => {
  mocks.releaseRead();
  cleanup();
  vi.restoreAllMocks();
});

describe("LogConsoleTile", () => {
  it("uses resumable physical grants when a source budget account is available", async () => {
    const boundedRead = vi.fn().mockResolvedValue({
      batches: [],
      coverageByStream: new Map(),
      stopReason: "source-exhausted",
      unavailableByStream: new Map(),
      usage: {
        chunksOpened: 1,
        decompressedBytes: 0,
        decompressionCacheHits: 0,
        elapsedMs: 1,
        logicalSourceBytes: 1,
        logicalUncompressedBytes: 1,
        messagesDecoded: 0,
        transferredBytes: 1,
      },
    });
    mocks.setBudgetAccount({
      createJob: () => ({ read: boundedRead }),
      remaining: () => ({
        maxMessages: 10_000,
        maxSourceBytes: 100_000_000,
        maxUncompressedBytes: 100_000_000,
        maxWallTimeMs: 10_000,
      }),
      reserve: () => undefined,
    });
    mocks.resetSession({ endNs: 10_000_000_000n, startNs: 0n });

    render(<LogConsoleTile />);

    await waitFor(() => expect(boundedRead).toHaveBeenCalled());
    expect(mocks.read).not.toHaveBeenCalled();
    expect(boundedRead.mock.calls[0]?.[0]).toMatchObject({
      budget: {
        maxMessages: 2_000,
        maxSourceBytes: 32 * 1024 * 1024,
        maxUncompressedBytes: 64 * 1024 * 1024,
        maxWallTimeMs: 500,
      },
      preferredTimeNs: 1_999_999_999n,
      streams: ["/rosout"],
      window: { endNs: 3_999_999_999n, startNs: 0n },
    });
  });

  it("opens the initial Follow window around the current playhead", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.resetSession({ endNs: 100_000_000_000n, startNs: 0n });
    render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    expect(mocks.nearestTick).toHaveBeenCalledWith(40);
    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      window: {
        endNs: 43_999_999_999n,
        startNs: 40_000_000_000n,
      },
    });
  });

  it("preserves the follow throttle while a history read is loading", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/loading/)).toBeTruthy();
    expect(mocks.nearestTick).toHaveBeenCalledTimes(1);

    act(() => mocks.releaseRead());
    await waitFor(() => expect(screen.queryByText(/loading/)).toBeNull());
    expect(mocks.nearestTick).toHaveBeenCalledTimes(1);
  });

  it("moves the fetched tail forward as playback advances", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());

    act(() => mocks.releaseRead());
    await waitFor(() => expect(screen.queryByText(/loading/)).toBeNull());

    now = 2_000;
    mocks.getPlayhead.mockReturnValue(5);
    act(() => mocks.runPlayheadSubscriber());

    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    expect(mocks.read.mock.calls[1]?.[0]).toMatchObject({
      window: {
        endNs: 7_000_000_000n,
        startNs: 4_000_000_000n,
      },
    });
  });

  it("seeks with playback time when the displayed payload stamp diverges", async () => {
    mocks.setReadFrames([
      {
        output: {
          attributes: {
            logRows: [
              {
                level: "info",
                message: "divergent stamp",
                timestampNs: 999_000_000_000n,
              },
            ],
          },
        },
        sequence: 1,
        streamId: "/rosout",
        timestampNs: 1_000_000_000n,
      },
    ]);
    render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    act(() => mocks.releaseRead());

    const message = await screen.findByText("divergent stamp");
    act(() => message.click());
    expect(mocks.seek).toHaveBeenCalledWith(1);
  });

  it("reports that matching rows may be missing when fallback search hits its cap", async () => {
    mocks.setReadFrames(
      Array.from({ length: 600 }, (_, index) => ({
        output: {
          attributes: { level: "info", message: `message-${index}` },
        },
        sequence: index,
        streamId: "/rosout",
        timestampNs: 1_000_000_000n + BigInt(index),
      })),
    );
    render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    act(() => mocks.releaseRead());

    expect(
      await screen.findByText(
        /window partially searched; matches may be missing/,
      ),
    ).toBeTruthy();
  });

  it("aborts the active fallback read on unmount", async () => {
    const view = render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    const request = mocks.read.mock.calls[0]?.[0];
    if (!request?.signal) throw new Error("Expected a cancellable log read");

    expect(request).toMatchObject({
      limit: 600,
      priority: "idle",
      streams: ["/rosout"],
    });
    expect(request.signal.aborted).toBe(false);

    view.unmount();
    expect(request.signal.aborted).toBe(true);
  });

  it("clips stable log tiles to the session manifest", async () => {
    mocks.resetSession({ endNs: 1_500_000_000n, startNs: 500_000_000n });

    render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());

    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      window: { endNs: 1_500_000_000n, startNs: 500_000_000n },
    });
  });
});
