import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../query/bytes";
import { VISUALIZATION_KIND } from "../../visualization";
import type { DecodedFrame } from "../../ir";
import type { EpisodeSession } from "../../ports";
import {
  EpisodeSceneUpdateHistoryBridge,
  EpisodeSceneUpdateHistoryProvider,
  useEpisodeSceneUpdateHistoryContext,
} from "./episode-scene-update-history-context";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EpisodeSceneUpdateHistoryBridge", () => {
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
      streams: ["/markers"],
      window: session.manifest.timeRange,
    });
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:ready:1:full",
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
      "/markers:error:0:full",
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
}: {
  readonly session: EpisodeSession;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <EpisodeSceneUpdateHistoryProvider>
      <EpisodeSceneUpdateHistoryBridge
        session={session}
        sceneAnnotationStreams={["/markers"]}
        sourceKey={source.sourceId}
      />
      <HistoryProbe />
    </EpisodeSceneUpdateHistoryProvider>
  );
}

function HistoryProbe() {
  const history = useEpisodeSceneUpdateHistoryContext();
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
            (state.truncated ? "truncated" : "full"),
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
