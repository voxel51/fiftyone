import { playheadAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapRawMessageRecordResult,
  type McapReadRawMessageRecordRequest,
  type McapResourceClient,
} from "../types";
import {
  McapDataStreamProvider,
  useSetMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import {
  McapRawMessageBridge,
  McapRawMessageProvider,
  useMcapRawMessageContext,
  type McapRawMessageContextValue,
} from "./mcap-raw-message-context";
import { createMcapTimelineIndex } from "./mcap-timeline-index";

afterEach(() => {
  cleanup();
});

describe("McapRawMessageBridge records", () => {
  it("reads complete message JSON only for an explicit request", async () => {
    const fullJson = JSON.stringify({ data: new Array(100).fill(7) });
    const client = createClient({
      readRawMessageRecord: vi.fn(async (request) => ({
        ...recordResult(request),
        fullJson: request.includeFullJson ? fullJson : undefined,
      })),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);
    await act(flushMicrotasks);

    let copiedJson: string | undefined;
    await act(async () => {
      copiedJson = await context.current?.readFullMessageJson(
        "/imu",
        42_000_000_000n,
      );
    });

    expect(copiedJson).toBe(fullJson);
    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(1);
    expect(client.readRawMessageRecord).toHaveBeenCalledWith({
      includeFullJson: true,
      source: createSource(),
      timeNs: 42_000_000_000n,
      topic: "/imu",
    });
  });

  it("fetches the subscribed topic's record at the playhead", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });

    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(1);
    expect(client.readRawMessageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ timeNs: 60_000_000_000n, topic: "/imu" }),
    );
    expect(context.current?.recordsByTopic.get("/imu")?.status).toBe("ready");
  });

  it("dedupes concurrent interest and serves the validity window", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    // A later subscriber at the same playhead lands inside the window.
    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });

    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the playhead stays inside the validity window", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    // Inside the 10s validity window granted by the fake result: no read.
    await act(async () => {
      store.set(playheadAtom, 65);
      await flushMicrotasks();
    });

    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(1);
  });

  it("refetches when the playhead leaves the validity window", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    await act(async () => {
      store.set(playheadAtom, 300);
      await flushMicrotasks();
    });

    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(2);
    expect(client.readRawMessageRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeNs: 300_000_000_000n }),
    );
  });

  it("surfaces errors only when nothing is shown and retries on demand", async () => {
    const client = createClient({
      readRawMessageRecord: vi
        .fn<McapResourceClient["readRawMessageRecord"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(async (request) => recordResult(request)),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByTopic.get("/imu")?.status).toBe("error");

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByTopic.get("/imu")?.status).toBe("ready");
  });

  it("services interest registered before the bridge mounted", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();

    const { rerender } = render(
      <Harness
        bridge={false}
        client={client}
        contextRef={context}
        store={store}
      />,
    );

    act(() => {
      context.current?.subscribeRecord("/imu");
    });
    expect(client.readRawMessageRecord).not.toHaveBeenCalled();

    rerender(
      <Harness bridge client={client} contextRef={context} store={store} />,
    );
    await act(flushMicrotasks);

    expect(client.readRawMessageRecord).toHaveBeenCalledTimes(1);
  });
});

describe("McapRawMessageBridge topics", () => {
  it("reads the inventory once and maps picker rows", async () => {
    const client = createClient({
      readTopics: vi.fn(async () => [
        inventoryEntry({
          metadata: {
            "mcap.message_encoding": "protobuf",
            "mcap.schema_name": "foxglove.PointCloud",
            "mcap.topic": "/lidar",
          },
          recordCount: "42",
        }),
        inventoryEntry({
          displayName: "/imu",
          metadata: { "mcap.message_encoding": "ros1", "mcap.topic": "/imu" },
        }),
      ]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);

    await act(async () => {
      context.current?.ensureTopics();
      context.current?.ensureTopics();
      await flushMicrotasks();
    });

    expect(client.readTopics).toHaveBeenCalledTimes(1);
    expect(context.current?.topics.status).toBe("ready");
    expect(context.current?.topics.topics).toEqual([
      {
        messageCount: 42,
        messageEncoding: "protobuf",
        schemaName: "foxglove.PointCloud",
        topic: "/lidar",
      },
      {
        messageCount: null,
        messageEncoding: "ros1",
        schemaName: null,
        topic: "/imu",
      },
    ]);
  });
});

function Harness({
  bridge = true,
  client,
  contextRef,
  store,
}: {
  readonly bridge?: boolean;
  readonly client: McapResourceClient;
  readonly contextRef: { current: McapRawMessageContextValue | null };
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <McapRawMessageProvider>
      <McapDataStreamProvider>
        <FakeDataStream />
        {bridge ? (
          <McapRawMessageBridge client={client} source={createSource()} />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </McapDataStreamProvider>
    </McapRawMessageProvider>
  );
  return store ? (
    <PlaybackStoreContext.Provider value={store}>
      {body}
    </PlaybackStoreContext.Provider>
  ) : (
    body
  );
}

function FakeDataStream() {
  const setDataStream = useSetMcapDataStream();
  // This effect publishes a synthetic data-stream handle whose timeline
  // index spans [0, 7200s] — the bridge only reads getTimelineIndex().
  useEffect(() => {
    const timeline = createMcapTimelineIndex({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 7_200_000_000_000n,
      startTimeNs: 0n,
    });
    const stream: McapDataStream = {
      getTimelineIndex: () => timeline,
      getTopicCache: () => undefined,
      sourceKey: "test",
      subscribeToTopic: () => () => undefined,
    };
    setDataStream(stream);
    return () => setDataStream(null);
  }, [setDataStream]);
  return null;
}

function ContextProbe({
  contextRef,
}: {
  readonly contextRef: { current: McapRawMessageContextValue | null };
}) {
  const value = useMcapRawMessageContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): {
  current: McapRawMessageContextValue | null;
} {
  return { current: null };
}

/**
 * Fake result granting a 10s validity window from the requested time.
 */
function recordResult(
  request: McapReadRawMessageRecordRequest,
): McapRawMessageRecordResult {
  return {
    encodedPayloadBytes: 12,
    logTimeNs: request.timeNs,
    messageEncoding: "json",
    publishTimeNs: request.timeNs,
    root: {
      entries: [["v", { kind: "scalar", value: "1", valueType: "number" }]],
      kind: "object",
    },
    schemaName: "test.State",
    sequence: 1,
    status: "ok",
    topic: request.topic,
    validFromNs: request.timeNs,
    validUntilNs: request.timeNs + 10_000_000_000n,
  };
}

function inventoryEntry(
  overrides: Partial<{
    displayName: string;
    metadata: Record<string, string>;
    recordCount: string;
  }>,
): StreamInventory {
  return {
    displayName: overrides.displayName,
    metadata: overrides.metadata ?? {},
    recordCount: overrides.recordCount,
    streamId: "1",
  } as unknown as StreamInventory;
}

function createClient(
  overrides: Partial<McapResourceClient> = {},
): McapResourceClient {
  return {
    dispose: vi.fn(),
    enumerateNumericFields: vi.fn(async () => []),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readNumericSeries: vi.fn(),
    readRawMessageRecord: vi.fn(
      async (request: McapReadRawMessageRecordRequest) => recordResult(request),
    ),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
    ...overrides,
  };
}

function createSource(): ByteSourceDescriptor {
  return { sourceId: "test", url: "memory://test.mcap" };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
