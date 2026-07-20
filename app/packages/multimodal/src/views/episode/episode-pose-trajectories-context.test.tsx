import {
  PlaybackProvider,
  setIsBuffering,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { isPlayingAtom } from "@fiftyone/playback/runtime";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type { DecodedFrame } from "../../ir";
import type { EpisodeSession } from "../../ports";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../runtime/frame-transforms";
import {
  EpisodeFrameTransformsProvider,
  useSetEpisodeFrameTransformsContext,
} from "./episode-frame-transforms-context";
import { setEpisodeNetworkHealth } from "./episode-network-health";
import {
  EpisodePoseTrajectoriesBridge,
  EpisodePoseTrajectoriesProvider,
  EpisodePoseTrajectoriesStartupGate,
  useEpisodePoseTrajectoriesContext,
} from "./episode-pose-trajectories-context";
import type { EpisodeFrameTransformsState } from "./use-episode-frame-transforms";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EpisodePoseTrajectoriesBridge", () => {
  it("delays full-history pose reads and sends them to the bulk lane", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const session = createSession();

    const { rerender } = render(
      <Harness session={session} enabled={false} source={source} />,
    );

    await advanceTimers(2_000);
    expect(session.read).not.toHaveBeenCalled();

    rerender(<Harness session={session} enabled source={source} />);

    await advanceTimers(1_499);
    expect(session.read).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(session.read).toHaveBeenCalledWith({
      limit: 25_000,
      priority: "bulk",
      streams: ["/pose"],
      window: session.manifest.timeRange,
    });
  });

  it("cancels a pending start when disabled before the delay fires", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const session = createSession();

    const { rerender } = render(
      <Harness session={session} enabled source={source} />,
    );

    await advanceTimers(1_000);
    rerender(<Harness session={session} enabled={false} source={source} />);

    await advanceTimers(5_000);
    expect(session.read).not.toHaveBeenCalled();
  });

  it("publishes decimated points, the stream frame, and error status", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const session = createSession(async function* () {
      yield poseMessage(10n, [1, 2, 0], "map");
      yield { output: {}, streamId: "/pose", timestampNs: 15n };
      yield poseMessage(20n, [3, 4, 0]);
    });

    render(<Harness session={session} enabled source={source} />);
    await advanceTimers(1_500);

    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:ready:2:map",
    );

    cleanup();
    const failingClient = createSession(async function* () {
      yield poseMessage(10n, [1, 2, 0]);
      throw new Error("read failed");
    });
    render(<Harness session={failingClient} enabled source={source} />);
    await advanceTimers(1_500);

    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:error:0:",
    );
  });
});

describe("EpisodePoseTrajectoriesStartupGate", () => {
  it("holds reads while transforms load and starts once they settle", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const session = createSession();

    render(<GateHarness session={session} source={source} />);

    // Transforms still loading: the delay elapsing must not start reads.
    await act(async () => {
      screen.getByTestId("set-loading").click();
    });
    await advanceTimers(5_000);
    expect(session.read).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByTestId("set-ready").click();
    });
    await advanceTimers(1_499);
    expect(session.read).not.toHaveBeenCalled();
    await advanceTimers(1);
    expect(session.read).toHaveBeenCalledTimes(1);
  });

  it("opens on transform errors instead of silently dropping trajectories", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const session = createSession();

    render(<GateHarness session={session} source={source} />);

    await act(async () => {
      screen.getByTestId("set-error").click();
    });
    await advanceTimers(1_500);
    expect(session.read).toHaveBeenCalledTimes(1);
  });
});

describe("starved-playback stand-down", () => {
  it("aborts a running read when starvation appears mid-stream and retries after it clears", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const storeCapture = capturePlaybackStore();
    let releaseSecondMessage = () => undefined as void;
    const secondMessageGate = new Promise<void>((resolve) => {
      releaseSecondMessage = resolve;
    });
    let generatorFinalized = false;
    const session = createSession(async function* () {
      try {
        yield poseMessage(10n, [1, 2, 0], "map");
        await secondMessageGate;
        yield poseMessage(20n, [3, 4, 0]);
      } finally {
        generatorFinalized = true;
      }
    });

    render(
      <PlaybackProvider duration={1}>
        <PlaybackStoreProbe onStore={storeCapture.onStore} />
        <Harness session={session} enabled source={source} />
      </PlaybackProvider>,
    );
    const store = storeCapture.store();

    // The read starts on a healthy link and consumes its first message.
    await advanceTimers(1_500);
    expect(session.read).toHaveBeenCalledTimes(1);

    // Starvation appears mid-read: network-limited while playback waits.
    act(() => {
      setEpisodeNetworkHealth(store, {
        busyFraction: 1,
        busyThroughputBytesPerSec: null,
        limited: true,
        throughputBytesPerSec: 1_000,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
      setIsBuffering(store, true);
    });
    await act(async () => {
      releaseSecondMessage();
      await Promise.resolve();
    });

    // The consumer bailed (cancelling the worker job) without publishing
    // a partial or error state.
    expect(generatorFinalized).toBe(true);
    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:loading:0:",
    );

    // Still starved at the retry cadence: no new read is launched.
    await advanceTimers(2_000);
    expect(session.read).toHaveBeenCalledTimes(1);

    // Starvation clears; the next retry re-reads the stream end to end.
    act(() => {
      setIsBuffering(store, false);
    });
    await advanceTimers(2_000);
    expect(session.read).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:ready:2:map",
    );
  });

  it("waits out active playback on a limited link even without buffering", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const storeCapture = capturePlaybackStore();
    const session = createSession();

    render(
      <PlaybackProvider duration={1}>
        <PlaybackStoreProbe onStore={storeCapture.onStore} />
        <Harness session={session} enabled source={source} />
      </PlaybackProvider>,
    );
    const store = storeCapture.store();

    // Smooth playback on a limited-verdict link: the whole-file scan
    // must not launch and steal the playhead's bandwidth.
    act(() => {
      setEpisodeNetworkHealth(store, {
        busyFraction: 1,
        busyThroughputBytesPerSec: null,
        limited: true,
        throughputBytesPerSec: 1_000,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
      store.set(isPlayingAtom, true);
    });

    await advanceTimers(6_000);
    expect(session.read).not.toHaveBeenCalled();

    // Pausing frees the link for banking; the next retry launches.
    act(() => {
      store.set(isPlayingAtom, false);
    });
    await advanceTimers(2_000);
    expect(session.read).toHaveBeenCalledTimes(1);
  });
});

function Harness({
  session,
  enabled,
  source,
}: {
  readonly session: EpisodeSession;
  readonly enabled: boolean;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <EpisodePoseTrajectoriesProvider>
      <EpisodePoseTrajectoriesBridge
        session={session}
        enabled={enabled}
        poseStreams={["/pose"]}
        sourceKey={source.sourceId}
      />
      <TrajectoriesProbe />
    </EpisodePoseTrajectoriesProvider>
  );
}

function GateHarness({
  session,
  source,
}: {
  readonly session: EpisodeSession;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <EpisodeFrameTransformsProvider>
      <EpisodePoseTrajectoriesProvider>
        <FrameTransformsStatusDriver />
        <EpisodePoseTrajectoriesStartupGate
          session={session}
          poseStreams={["/pose"]}
          sourceKey={source.sourceId}
        />
      </EpisodePoseTrajectoriesProvider>
    </EpisodeFrameTransformsProvider>
  );
}

function FrameTransformsStatusDriver() {
  const setFrameTransforms = useSetEpisodeFrameTransformsContext();
  const publish = (status: EpisodeFrameTransformsState["status"]) =>
    setFrameTransforms({
      error: status === "error" ? "bootstrap failed" : null,
      frameIds: [],
      getPlacementReadiness: () => ({
        frameIds: [],
        status: status === "loading" ? "loading" : "ready",
      }),
      indexedDynamicRanges: () => [],
      prefetchPlacement: () => undefined,
      resolve: (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "missing",
        targetFrameId,
      }),
      status,
      summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
    });

  return (
    <>
      <button data-testid="set-loading" onClick={() => publish("loading")} />
      <button data-testid="set-ready" onClick={() => publish("ready")} />
      <button data-testid="set-error" onClick={() => publish("error")} />
    </>
  );
}

function PlaybackStoreProbe({
  onStore,
}: {
  readonly onStore: (store: PlaybackStore) => void;
}) {
  const store = usePlaybackStore();
  useEffect(() => {
    onStore(store);
  }, [onStore, store]);
  return null;
}

function capturePlaybackStore() {
  let captured: PlaybackStore | undefined;
  return {
    onStore: (store: PlaybackStore) => {
      captured = store;
    },
    store: (): PlaybackStore => {
      if (!captured) {
        throw new Error("PlaybackStore was not captured");
      }
      return captured;
    },
  };
}

function TrajectoriesProbe() {
  const trajectories = useEpisodePoseTrajectoriesContext();
  return (
    <div data-testid="trajectories">
      {[...trajectories.entries()]
        .map(
          ([stream, state]) =>
            `${stream}:${state.status}:${state.points.length}:${
              state.streamFrameId ?? ""
            }`,
        )
        .join("|")}
    </div>
  );
}

function createSession(
  messages: () => AsyncGenerator<DecodedFrame, void, void> = emptyMessages,
): EpisodeSession {
  const manifest = {
    episodeId: "test",
    streams: [],
    timeDomain: { id: "log", kind: "timestamp" as const },
    timeRange: { endNs: 100n, startNs: 0n },
  };
  return {
    dispose: vi.fn(),
    manifest,
    read: vi.fn(async function* (request) {
      for await (const frame of messages()) {
        yield {
          frames: [
            { ...frame, streamId: request.streams[0] ?? frame.streamId },
          ],
          stream: request.streams[0] ?? frame.streamId,
        };
      }
    }),
  };
}

async function* emptyMessages(): AsyncGenerator<DecodedFrame, void, void> {
  for (const message of [] as DecodedFrame[]) {
    yield message;
  }
}

function poseMessage(
  timelineTimeNs: bigint,
  position: readonly [number, number, number],
  coordinateFrameId?: string,
): DecodedFrame {
  return {
    output: {
      visualization: {
        ...(coordinateFrameId ? { coordinateFrameId } : {}),
        kind: "pose",
        position,
        quaternion: [0, 0, 0, 1],
      },
    },
    streamId: "/pose",
    timestampNs: timelineTimeNs,
  } as unknown as DecodedFrame;
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return {
    sourceId,
    url: `memory://${sourceId}.mcap`,
  };
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
