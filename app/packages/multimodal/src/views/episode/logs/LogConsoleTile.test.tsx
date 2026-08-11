import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LogConsoleTile from "./LogConsoleTile";

const mocks = vi.hoisted(() => {
  let releaseRead: () => void = () => undefined;
  let readGate: Promise<void>;
  let readFrames: readonly unknown[] = [];
  let seedFrames: readonly unknown[] = [];
  let logSources = [{ id: "/rosout", label: "ROS logs" }];
  let enabledDiagnosticStreams: readonly string[] | undefined;
  let enabledStreams: readonly string[] | undefined;
  let viewMode: "diagnostics" | "logs" = "logs";
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
  const readSynchronized = vi.fn((request: { readonly timeNs: bigint }) =>
    Promise.resolve({
      endNs: request.timeNs,
      frames: seedFrames,
      framesByStream: {},
      startNs: 0n,
      streamPolicies: {},
      timeNs: request.timeNs,
    }),
  );
  let session: {
    readonly manifest: {
      readonly streams: readonly {
        readonly id: string;
        readonly payload: { readonly schema: string };
      }[];
      readonly timeRange: { readonly endNs: bigint; readonly startNs: bigint };
    };
    readonly playback?: {
      readonly readSynchronized: typeof readSynchronized;
      readonly timeline: {
        readonly endNs: bigint;
        readonly startNs: bigint;
        readonly timeDomainId: string;
      };
    };
    readonly read: typeof read;
  } = {
    manifest: {
      streams: [],
      timeRange: { endNs: 100_000_000_000n, startNs: 0n },
    },
    read,
  };
  let budgetAccount: unknown = null;
  return {
    get budgetAccount() {
      return budgetAccount;
    },
    dataStream: {
      getTimelineIndex: () => timelineIndex,
    },
    getPlayhead: vi.fn(() => 1),
    get logSources() {
      return logSources;
    },
    get enabledDiagnosticStreams() {
      return enabledDiagnosticStreams;
    },
    get enabledStreams() {
      return enabledStreams;
    },
    get viewMode() {
      return viewMode;
    },
    nearestTick,
    playbackStore: {},
    read,
    readSynchronized,
    releaseRead: () => releaseRead(),
    resetReadGate,
    resetSession: (
      timeRange?: {
        readonly endNs: bigint;
        readonly startNs: bigint;
      },
      diagnostics: boolean | string | readonly string[] = false,
    ) => {
      const diagnosticStreams: readonly string[] =
        typeof diagnostics === "boolean"
          ? ["/diagnostics"]
          : typeof diagnostics === "string"
            ? [diagnostics]
            : diagnostics;
      session = {
        manifest: {
          streams: diagnostics
            ? diagnosticStreams.map((id) => ({
                id,
                payload: { schema: "diagnostic_msgs/msg/DiagnosticArray" },
              }))
            : [],
          timeRange: timeRange ?? {
            endNs: 100_000_000_000n,
            startNs: 0n,
          },
        },
        ...(diagnostics
          ? {
              playback: {
                readSynchronized,
                timeline: {
                  endNs: timeRange?.endNs ?? 100_000_000_000n,
                  startNs: timeRange?.startNs ?? 0n,
                  timeDomainId: "test",
                },
              },
            }
          : {}),
        read,
      };
    },
    runPlayheadSubscriber: () => playheadSubscriber(),
    setBudgetAccount: (account: unknown) => {
      budgetAccount = account;
    },
    setReadFrames: (frames: readonly unknown[]) => {
      readFrames = frames;
    },
    setSeedFrames: (frames: readonly unknown[]) => {
      seedFrames = frames;
    },
    setLogSources: (sources: typeof logSources) => {
      logSources = sources;
    },
    setEnabledDiagnosticStreams: (streams: readonly string[] | undefined) => {
      enabledDiagnosticStreams = streams;
    },
    setEnabledStreams: (streams: readonly string[] | undefined) => {
      enabledStreams = streams;
    },
    setViewMode: (mode: typeof viewMode) => {
      viewMode = mode;
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
  FormField: ({
    control,
    label,
  }: {
    readonly control: ReactNode;
    readonly label: ReactNode;
  }) => (
    <label>
      {label}
      {control}
    </label>
  ),
  Select: ({
    className,
    "data-testid": testId,
    onChange,
    options = [],
    value = [],
  }: {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly onChange?: (value: string[]) => void;
    readonly options?: readonly {
      readonly data: { readonly label: string };
      readonly id: string;
    }[];
    readonly portal?: boolean;
    readonly value?: string | readonly string[];
  }) => (
    <select
      className={className}
      data-testid={testId}
      multiple
      onChange={(event) =>
        onChange?.(
          Array.from(
            event.currentTarget.selectedOptions,
            (option) => option.value,
          ),
        )
      }
      value={typeof value === "string" ? [value] : value}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.data.label}
        </option>
      ))}
    </select>
  ),
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
    enabledDiagnosticStreams: mocks.enabledDiagnosticStreams,
    enabledStreams: mocks.enabledStreams,
    followPlayhead: true,
    selectedLevels: ["info"],
    viewMode: mocks.viewMode,
  }),
  useSetLogTileSettings: () => mocks.setLogSettings,
}));

beforeEach(() => {
  mocks.setBudgetAccount(null);
  mocks.resetReadGate();
  mocks.resetSession();
  mocks.setReadFrames([]);
  mocks.setSeedFrames([]);
  mocks.setLogSources([{ id: "/rosout", label: "ROS logs" }]);
  mocks.setEnabledDiagnosticStreams(undefined);
  mocks.setEnabledStreams(undefined);
  mocks.setViewMode("logs");
  mocks.read.mockClear();
  mocks.readSynchronized.mockClear();
  mocks.nearestTick.mockClear();
  mocks.getPlayhead.mockReset();
  mocks.getPlayhead.mockReturnValue(1);
  mocks.seek.mockClear();
  mocks.subscribePlayhead.mockClear();
  mocks.setLogSettings.mockClear();
});

afterEach(() => {
  mocks.releaseRead();
  cleanup();
  vi.useRealTimers();
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

  it("hides Diagnostics when ordinary logs are the only available mode", async () => {
    render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Logs" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: "Diagnostics" })).toBeNull();
  });

  it("opens Diagnostics directly when it is the only available mode", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.setViewMode("logs");
    mocks.setLogSources([{ id: "/diagnostics", label: "ROS diagnostics" }]);
    mocks.resetSession({ endNs: 100_000_000_000n, startNs: 0n }, true);

    render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/diagnostics"],
    });
    expect(screen.queryByRole("button", { name: "Logs" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Diagnostics" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("option", { name: "ROS diagnostics" }),
    ).toBeTruthy();
    expect(mocks.setLogSettings).not.toHaveBeenCalled();
  });

  it("bootstraps quiet diagnostic state before the visible history window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.setViewMode("diagnostics");
    mocks.setLogSources([{ id: "/diagnostics", label: "ROS diagnostics" }]);
    mocks.setSeedFrames([
      {
        output: {
          attributes: {
            logRows: [
              {
                hardwareId: "robot",
                kind: "diagnostic",
                level: "info",
                message: "quiet sensor",
                name: "lidar",
                status: "OK",
              },
            ],
          },
        },
        sequence: 1,
        streamId: "/diagnostics",
        timestampNs: 5_000_000_000n,
      },
    ]);
    mocks.resetSession({ endNs: 100_000_000_000n, startNs: 0n }, true);

    render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.readSynchronized).toHaveBeenCalled());
    expect(mocks.readSynchronized.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/diagnostics"],
      timeNs: 9_999_999_999n,
    });
    act(() => mocks.releaseRead());
    expect(await screen.findByText("quiet sensor")).toBeTruthy();
    expect(screen.getByText("stale · 35s")).toBeTruthy();
    expect(screen.getByText(/earlier identities may be missing/)).toBeTruthy();
  });

  it("restarts diagnostic seeding when the selected stream scope changes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.setViewMode("diagnostics");
    mocks.setLogSources([{ id: "/diagnostics", label: "ROS diagnostics" }]);
    mocks.resetSession(
      { endNs: 100_000_000_000n, startNs: 0n },
      "/diagnostics",
    );
    const view = render(<LogConsoleTile />);
    await waitFor(() =>
      expect(mocks.readSynchronized).toHaveBeenCalledTimes(1),
    );

    mocks.setLogSources([
      { id: "/diagnostics_alt", label: "Alternate diagnostics" },
    ]);
    mocks.resetSession(
      { endNs: 100_000_000_000n, startNs: 0n },
      "/diagnostics_alt",
    );
    view.rerender(<LogConsoleTile />);

    await waitFor(() =>
      expect(mocks.readSynchronized).toHaveBeenCalledTimes(2),
    );
    expect(mocks.readSynchronized.mock.calls[1]?.[0]).toMatchObject({
      streams: ["/diagnostics_alt"],
      timeNs: 9_999_999_999n,
    });
  });

  it("seeds the current horizon when switching from logs to diagnostics", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.setViewMode("logs");
    mocks.setLogSources([
      { id: "/rosout", label: "ROS logs" },
      { id: "/diagnostics", label: "ROS diagnostics" },
    ]);
    mocks.resetSession({ endNs: 100_000_000_000n, startNs: 0n }, true);
    const view = render(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/rosout"],
    });
    expect(screen.getByRole("option", { name: "ROS logs" })).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: "ROS diagnostics" }),
    ).toBeNull();
    expect(mocks.readSynchronized).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(mocks.setLogSettings).toHaveBeenCalledWith({
      viewMode: "diagnostics",
    });
    expect(mocks.setLogSettings).toHaveBeenCalledTimes(1);

    mocks.setViewMode("diagnostics");
    view.rerender(<LogConsoleTile />);

    await waitFor(() => expect(mocks.readSynchronized).toHaveBeenCalledOnce());
    expect(mocks.readSynchronized.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/diagnostics"],
      timeNs: 9_999_999_999n,
    });
  });

  it("keeps diagnostic source selection independent and honors explicit empty", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    mocks.getPlayhead.mockReturnValue(40);
    mocks.setViewMode("diagnostics");
    mocks.setLogSources([
      { id: "/diagnostics", label: "Diagnostics" },
      { id: "/diagnostics_agg", label: "Diagnostics aggregate" },
    ]);
    mocks.setEnabledDiagnosticStreams([]);
    mocks.resetSession({ endNs: 100_000_000_000n, startNs: 0n }, [
      "/diagnostics",
      "/diagnostics_agg",
    ]);
    const view = render(<LogConsoleTile />);

    expect(await screen.findByText("No filters selected")).toBeTruthy();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.readSynchronized).not.toHaveBeenCalled();

    mocks.setEnabledDiagnosticStreams(["/diagnostics"]);
    view.rerender(<LogConsoleTile />);

    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    await waitFor(() => expect(mocks.readSynchronized).toHaveBeenCalled());
    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/diagnostics"],
    });
    expect(mocks.readSynchronized.mock.calls[0]?.[0]).toMatchObject({
      streams: ["/diagnostics"],
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

  it("publishes the latest playhead after a throttled discrete step", () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    render(<LogConsoleTile />);
    expect(mocks.nearestTick).toHaveBeenLastCalledWith(1);

    now = 1_100;
    mocks.getPlayhead.mockReturnValue(2);
    act(() => mocks.runPlayheadSubscriber());
    expect(mocks.nearestTick).toHaveBeenCalledTimes(1);

    now = 1_500;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mocks.nearestTick).toHaveBeenLastCalledWith(2);
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
        endNs: 7_999_999_999n,
        startNs: 4_000_000_000n,
      },
    });
  });

  it("prefetches future rows without displaying them before the playhead", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.setReadFrames([
      {
        output: {
          attributes: { level: "info", message: "prefetched future" },
        },
        sequence: 1,
        streamId: "/rosout",
        timestampNs: 2_000_000_000n,
      },
    ]);
    render(<LogConsoleTile />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    act(() => mocks.releaseRead());

    await waitFor(() => expect(screen.queryByText(/loading/)).toBeNull());
    expect(screen.queryByText("prefetched future")).toBeNull();

    now = 2_000;
    mocks.getPlayhead.mockReturnValue(2);
    act(() => mocks.runPlayheadSubscriber());
    expect(await screen.findByText("prefetched future")).toBeTruthy();
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
