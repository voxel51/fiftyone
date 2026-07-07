import {
  PlaybackProvider,
  setIsBuffering,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { isPlayingAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { McapDecodedMessage, McapResourceClient } from "../types";
import { EMPTY_MCAP_FRAME_GRAPH_SUMMARY } from "../frame-transforms";
import {
  McapFrameTransformsProvider,
  useSetMcapFrameTransformsContext,
} from "./mcap-frame-transforms-context";
import { setMcapNetworkHealth } from "./mcap-network-health";
import {
  McapPoseTrajectoriesBridge,
  McapPoseTrajectoriesProvider,
  McapPoseTrajectoriesStartupGate,
  useMcapPoseTrajectoriesContext,
} from "./mcap-pose-trajectories-context";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapPoseTrajectoriesBridge", () => {
  it("delays full-history pose reads and sends them to the bulk lane", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const client = createClient();

    const { rerender } = render(
      <Harness client={client} enabled={false} source={source} />,
    );

    await advanceTimers(2_000);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    rerender(<Harness client={client} enabled source={source} />);

    await advanceTimers(1_499);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(client.readDecodedMessages).toHaveBeenCalledWith(
      {
        activeTimeline: "log",
        limit: 25_000,
        source,
        topics: ["/pose"],
      },
      { priority: "bulk" },
    );
  });

  it("cancels a pending start when disabled before the delay fires", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const client = createClient();

    const { rerender } = render(
      <Harness client={client} enabled source={source} />,
    );

    await advanceTimers(1_000);
    rerender(<Harness client={client} enabled={false} source={source} />);

    await advanceTimers(5_000);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();
  });

  it("publishes decimated points, the stream frame, and error status", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const client = createClient(async function* () {
      yield poseMessage(10n, [1, 2, 0], "map");
      yield { decoded: { output: {} }, timelineTimeNs: 15n } as never;
      yield poseMessage(20n, [3, 4, 0]);
    });

    render(<Harness client={client} enabled source={source} />);
    await advanceTimers(1_500);

    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:ready:2:map",
    );

    cleanup();
    const failingClient = createClient(async function* () {
      yield poseMessage(10n, [1, 2, 0]);
      throw new Error("read failed");
    });
    render(<Harness client={failingClient} enabled source={source} />);
    await advanceTimers(1_500);

    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:error:0:",
    );
  });
});

describe("McapPoseTrajectoriesStartupGate", () => {
  it("holds reads while transforms load and starts once they settle", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const client = createClient();

    render(<GateHarness client={client} source={source} />);

    // Transforms still loading: the delay elapsing must not start reads.
    await act(async () => {
      screen.getByTestId("set-loading").click();
    });
    await advanceTimers(5_000);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByTestId("set-ready").click();
    });
    await advanceTimers(1_499);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();
    await advanceTimers(1);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);
  });

  it("opens on transform errors instead of silently dropping trajectories", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const client = createClient();

    render(<GateHarness client={client} source={source} />);

    await act(async () => {
      screen.getByTestId("set-error").click();
    });
    await advanceTimers(1_500);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);
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
    const client = createClient(async function* () {
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
        <Harness client={client} enabled source={source} />
      </PlaybackProvider>,
    );
    const store = storeCapture.store();

    // The read starts on a healthy link and consumes its first message.
    await advanceTimers(1_500);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);

    // Starvation appears mid-read: network-limited while playback waits.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 1,
        limited: true,
        throughputBytesPerSec: 1_000,
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
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);

    // Starvation clears; the next retry re-reads the topic end to end.
    act(() => {
      setIsBuffering(store, false);
    });
    await advanceTimers(2_000);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("trajectories").textContent).toBe(
      "/pose:ready:2:map",
    );
  });

  it("waits out active playback on a limited link even without buffering", async () => {
    vi.useFakeTimers();
    const source = createSource("pose");
    const storeCapture = capturePlaybackStore();
    const client = createClient();

    render(
      <PlaybackProvider duration={1}>
        <PlaybackStoreProbe onStore={storeCapture.onStore} />
        <Harness client={client} enabled source={source} />
      </PlaybackProvider>,
    );
    const store = storeCapture.store();

    // Smooth playback on a limited-verdict link: the whole-file scan
    // must not launch and steal the playhead's bandwidth.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 1,
        limited: true,
        throughputBytesPerSec: 1_000,
        updatedAtMs: 1,
      });
      store.set(isPlayingAtom, true);
    });

    await advanceTimers(6_000);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    // Pausing frees the link for banking; the next retry launches.
    act(() => {
      store.set(isPlayingAtom, false);
    });
    await advanceTimers(2_000);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);
  });
});

function Harness({
  client,
  enabled,
  source,
}: {
  readonly client: McapResourceClient;
  readonly enabled: boolean;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <McapPoseTrajectoriesProvider>
      <McapPoseTrajectoriesBridge
        client={client}
        enabled={enabled}
        poseTopics={["/pose"]}
        source={source}
      />
      <TrajectoriesProbe />
    </McapPoseTrajectoriesProvider>
  );
}

function GateHarness({
  client,
  source,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <McapFrameTransformsProvider>
      <McapPoseTrajectoriesProvider>
        <FrameTransformsStatusDriver />
        <McapPoseTrajectoriesStartupGate
          client={client}
          poseTopics={["/pose"]}
          source={source}
        />
      </McapPoseTrajectoriesProvider>
    </McapFrameTransformsProvider>
  );
}

function FrameTransformsStatusDriver() {
  const setFrameTransforms = useSetMcapFrameTransformsContext();
  const publish = (status: McapFrameTransformsState["status"]) =>
    setFrameTransforms({
      error: status === "error" ? "bootstrap failed" : null,
      frameIds: [],
      resolve: (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "missing",
        targetFrameId,
      }),
      status,
      summarizeGraph: () => EMPTY_MCAP_FRAME_GRAPH_SUMMARY,
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
  const trajectories = useMcapPoseTrajectoriesContext();
  return (
    <div data-testid="trajectories">
      {[...trajectories.entries()]
        .map(
          ([topic, state]) =>
            `${topic}:${state.status}:${state.points.length}:${
              state.streamFrameId ?? ""
            }`,
        )
        .join("|")}
    </div>
  );
}

function createClient(
  messages: () => AsyncGenerator<
    McapDecodedMessage,
    void,
    void
  > = emptyMessages,
): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(messages),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readRawMessageRecord: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
    enumerateNumericFields: vi.fn(async () => []),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 0n,
      fields: [],
      messageCount: 0,
      topic: "",
      truncated: false,
    })),
  };
}

async function* emptyMessages(): AsyncGenerator<
  McapDecodedMessage,
  void,
  void
> {
  for (const message of [] as McapDecodedMessage[]) {
    yield message;
  }
}

function poseMessage(
  timelineTimeNs: bigint,
  position: readonly [number, number, number],
  coordinateFrameId?: string,
): McapDecodedMessage {
  return {
    decoded: {
      output: {
        visualization: {
          ...(coordinateFrameId ? { coordinateFrameId } : {}),
          kind: "pose",
          position,
          quaternion: [0, 0, 0, 1],
        },
      },
    },
    timelineTimeNs,
  } as unknown as McapDecodedMessage;
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
