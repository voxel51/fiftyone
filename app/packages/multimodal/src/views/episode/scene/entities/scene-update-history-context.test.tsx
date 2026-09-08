import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../../../query/bytes/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import type { DecodedFrame } from "../../../../ir/index";
import type { EpisodeSession } from "../../../../ports/index";
import {
  SceneUpdateHistoryBridge,
  SceneUpdateHistoryProvider,
  useSceneUpdateHistoryContext,
} from "./scene-update-history-context";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SceneUpdateHistoryBridge", () => {
  it("does not scan an unselected scene-update stream", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const source = createSource("markers");
    const view = render(
      <Harness session={session} source={source} streams={[]} />,
    );

    await advanceTimers(5_000);
    expect(session.read).not.toHaveBeenCalled();

    view.rerender(
      <Harness session={session} source={source} streams={["/markers"]} />,
    );
    await advanceTimers(1_500);
    expect(session.read).toHaveBeenCalledTimes(1);
  });

  it("delays full-history reads, uses the bulk lane, and publishes deltas", async () => {
    vi.useFakeTimers();
    const source = createSource("markers");
    const session = createSession(async function* () {
      yield sceneUpdateMessage(10n);
    });

    render(<Harness session={session} source={source} />);

    await advanceTimers(1_499);
    expect(session.read).not.toHaveBeenCalled();
    await advanceTimers(1);
    expect(session.read).toHaveBeenCalledWith({
      limit: 50_000,
      priority: "bulk",
      signal: expect.any(AbortSignal),
      streams: ["/markers"],
      window: session.manifest.timeRange,
    });
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:ready:1:full:100",
    );
  });

  it("publishes only a completed generic tile as a covered prefix", async () => {
    vi.useFakeTimers();
    let releaseRemainder: () => void = () => undefined;
    const remainder = new Promise<void>((resolve) => {
      releaseRemainder = resolve;
    });
    const session = createSession(async function* () {
      yield sceneUpdateMessage(10n);
      await remainder;
      yield sceneUpdateMessage(20n);
    });

    render(
      <Harness
        session={session}
        source={createSource("markers")}
        streams={["/markers"]}
      />,
    );
    await advanceTimers(1_500);
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:loading:0:full:none",
    );

    releaseRemainder();
    await act(async () => {
      await remainder;
    });
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:ready:2:full:100",
    );
  });

  it("publishes an error without retaining partial deltas", async () => {
    vi.useFakeTimers();
    const session = createSession(async function* () {
      yield sceneUpdateMessage(10n);
      throw new Error("read failed");
    });

    render(<Harness session={session} source={createSource("markers")} />);
    await advanceTimers(1_500);

    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:error:0:full:none",
    );
  });

  it("aborts an active read and suppresses stale progress after demand removal", async () => {
    vi.useFakeTimers();
    let releaseRemainder: () => void = () => undefined;
    const remainder = new Promise<void>((resolve) => {
      releaseRemainder = resolve;
    });
    const session = createSession(async function* () {
      yield sceneUpdateMessage(10n);
      await remainder;
      yield sceneUpdateMessage(20n);
    });
    const source = createSource("markers");
    const view = render(
      <Harness session={session} source={source} streams={["/markers"]} />,
    );
    await advanceTimers(1_500);
    const signal = vi.mocked(session.read).mock.calls[0]?.[0].signal;
    expect(signal?.aborted).toBe(false);

    view.rerender(<Harness session={session} source={source} streams={[]} />);
    expect(signal?.aborted).toBe(true);
    releaseRemainder();
    await act(async () => {
      await remainder;
    });

    expect(screen.getByTestId("scene-history").textContent).toBe("");
  });

  it("does not publish an unproven generic prefix mid-tile", async () => {
    vi.useFakeTimers();
    let releaseLast: () => void = () => undefined;
    const last = new Promise<void>((resolve) => {
      releaseLast = resolve;
    });
    const session = createSession(async function* () {
      for (let index = 1; index <= 251; index += 1) {
        yield sceneUpdateMessage(BigInt(index));
      }
      await last;
      yield sceneUpdateMessage(252n);
    });

    render(<Harness session={session} source={createSource("markers")} />);
    await advanceTimers(1_500);
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:loading:0:full:none",
    );

    releaseLast();
    await act(async () => {
      await last;
    });
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:ready:252:full:100",
    );
  });

  it("remains optional outside the full playback provider tree", () => {
    render(<HistoryProbe />);

    expect(screen.getByTestId("scene-history").textContent).toBe("");
  });
});

function Harness({
  session,
  source,
  streams = ["/markers"],
}: {
  readonly session: EpisodeSession;
  readonly source: ByteSourceDescriptor;
  readonly streams?: readonly string[];
}) {
  return (
    <SceneUpdateHistoryProvider>
      <SceneUpdateHistoryBridge
        session={session}
        sceneAnnotationStreams={streams}
        sourceKey={source.sourceId}
      />
      <HistoryProbe />
    </SceneUpdateHistoryProvider>
  );
}

function HistoryProbe() {
  const history = useSceneUpdateHistoryContext();
  return (
    <div data-testid="scene-history">
      {[...history.entries()]
        .map(
          ([stream, state]) =>
            stream +
            ":" +
            state.status +
            ":" +
            state.deltas.length +
            ":" +
            (state.truncated ? "truncated" : "full") +
            ":" +
            (state.loadedThroughNs?.toString() ?? "none"),
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
  for (const message of [] as DecodedFrame[]) yield message;
}

function sceneUpdateMessage(timelineTimeNs: bigint): DecodedFrame {
  return {
    output: {
      visualization: {
        entities: [],
        kind: VISUALIZATION_KIND.SCENE_UPDATE,
      },
    },
    streamId: "/markers",
    timestampNs: timelineTimeNs,
  } as unknown as DecodedFrame;
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return { sourceId, url: "memory://" + sourceId + ".mcap" };
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
