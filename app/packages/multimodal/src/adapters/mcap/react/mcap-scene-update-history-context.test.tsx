import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ByteSourceDescriptor } from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapDecodedMessage, McapResourceClient } from "../types";
import {
  McapSceneUpdateHistoryBridge,
  McapSceneUpdateHistoryProvider,
  useMcapSceneUpdateHistoryContext,
} from "./mcap-scene-update-history-context";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapSceneUpdateHistoryBridge", () => {
  it("delays full-history reads, uses the bulk lane, and publishes deltas", async () => {
    vi.useFakeTimers();
    const source = createSource("markers");
    const client = createClient(async function* () {
      yield sceneUpdateMessage(10n);
    });

    render(<Harness client={client} source={source} />);

    await advanceTimers(1_499);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();
    await advanceTimers(1);
    expect(client.readDecodedMessages).toHaveBeenCalledWith(
      {
        activeTimeline: "log",
        limit: 50_000,
        source,
        topics: ["/markers"],
      },
      { priority: "bulk" },
    );
    expect(screen.getByTestId("scene-history").textContent).toBe(
      "/markers:ready:1:full",
    );
  });

  it("publishes an error without retaining partial deltas", async () => {
    vi.useFakeTimers();
    const client = createClient(async function* () {
      yield sceneUpdateMessage(10n);
      throw new Error("read failed");
    });

    render(<Harness client={client} source={createSource("markers")} />);
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
  client,
  source,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <McapSceneUpdateHistoryProvider>
      <McapSceneUpdateHistoryBridge
        client={client}
        sceneAnnotationTopics={["/markers"]}
        source={source}
      />
      <HistoryProbe />
    </McapSceneUpdateHistoryProvider>
  );
}

function HistoryProbe() {
  const history = useMcapSceneUpdateHistoryContext();
  return (
    <div data-testid="scene-history">
      {[...history.entries()]
        .map(
          ([topic, state]) =>
            topic +
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

function createClient(
  messages: () => AsyncGenerator<
    McapDecodedMessage,
    void,
    void
  > = emptyMessages,
): McapResourceClient {
  return {
    dispose: vi.fn(),
    enumerateNumericFields: vi.fn(async () => []),
    readDecodedMessages: vi.fn(messages),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 0n,
      fields: [],
      messageCount: 0,
      topic: "",
      truncated: false,
    })),
    readRawMessageRecord: vi.fn(),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopicTimeBounds: vi.fn(async () => []),
    readTopics: vi.fn(async () => []),
  };
}

async function* emptyMessages(): AsyncGenerator<
  McapDecodedMessage,
  void,
  void
> {
  for (const message of [] as McapDecodedMessage[]) yield message;
}

function sceneUpdateMessage(timelineTimeNs: bigint): McapDecodedMessage {
  return {
    decoded: {
      output: {
        visualization: {
          entities: [],
          kind: VISUALIZATION_KIND.SCENE_UPDATE,
        },
      },
    },
    timelineTimeNs,
  } as unknown as McapDecodedMessage;
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return { sourceId, url: "memory://" + sourceId + ".mcap" };
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
