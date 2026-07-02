import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { McapResourceClient } from "../types";
import {
  McapPoseTrajectoriesBridge,
  McapPoseTrajectoriesProvider,
} from "./mcap-pose-trajectories-context";

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
    </McapPoseTrajectoriesProvider>
  );
}

function createClient(): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(() => emptyMessages()),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
  };
}

async function* emptyMessages(): AsyncGenerator<never, void, void> {
  for (const message of [] as never[]) {
    yield message;
  }
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
