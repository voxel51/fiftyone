import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { McapDecodedMessage, McapResourceClient } from "../types";
import {
  McapFrameTransformsProvider,
  useSetMcapFrameTransformsContext,
} from "./mcap-frame-transforms-context";
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
    });

  return (
    <>
      <button data-testid="set-loading" onClick={() => publish("loading")} />
      <button data-testid="set-ready" onClick={() => publish("ready")} />
      <button data-testid="set-error" onClick={() => publish("error")} />
    </>
  );
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
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
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
