import { playheadAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex, type DataStream } from "../../../runtime";
import { DataStreamProvider, useSetDataStream } from "../../../runtime/react";
import type { RawRecordResult, RawRecordStream } from "../../../ir";
import type { RawRecordCapability } from "../../../ports";
import {
  RawMessageBridge,
  RawMessageProvider,
  useRawMessageContext,
  type RawMessageContextValue,
} from "./raw-message-context";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RawMessageBridge records", () => {
  it("reads complete message JSON only for an explicit request", async () => {
    const fullJson = JSON.stringify({ data: new Array(100).fill(7) });
    const client = createClient({
      readRawRecord: vi.fn(async (request) => ({
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
    expect(client.readRawRecord).toHaveBeenCalledTimes(1);
    expect(client.readRawRecord).toHaveBeenCalledWith({
      includeFullJson: true,
      stream: "/imu",
      timestampNs: 42_000_000_000n,
    });
  });

  it("fetches the subscribed stream's record at the playhead", async () => {
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });

    expect(client.readRawRecord).toHaveBeenCalledTimes(1);
    expect(client.readRawRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "/imu",
        timestampNs: 60_000_000_000n,
      }),
    );
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("ready");
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

    expect(client.readRawRecord).toHaveBeenCalledTimes(1);
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

    expect(client.readRawRecord).toHaveBeenCalledTimes(1);
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

    expect(client.readRawRecord).toHaveBeenCalledTimes(2);
    expect(client.readRawRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ timestampNs: 300_000_000_000n }),
    );
  });

  it("refetches the final playhead after rapid forward and backward seeks", async () => {
    vi.useFakeTimers();
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);

    await act(async () => {
      context.current?.subscribeRecord("/lidar");
      await flushMicrotasks();
    });
    await act(async () => {
      store.set(playheadAtom, 2_700);
      await flushMicrotasks();
    });
    await act(async () => {
      store.set(playheadAtom, 1_812);
      await flushMicrotasks();
    });

    expect(client.readRawRecord).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYHEAD_THROTTLE_FOR_TEST_MS);
      await flushMicrotasks();
    });
    expect(client.readRawRecord).toHaveBeenCalledTimes(3);
    expect(client.readRawRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ timestampNs: 1_812_000_000_000n }),
    );
  });

  it("surfaces errors only when nothing is shown and retries on demand", async () => {
    const client = createClient({
      readRawRecord: vi
        .fn<RawRecordCapability["readRawRecord"]>()
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
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("error");

    await act(async () => {
      store.set(playheadAtom, 61);
      await flushMicrotasks();
    });
    expect(client.readRawRecord).toHaveBeenCalledTimes(1);

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("ready");
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
    expect(client.readRawRecord).not.toHaveBeenCalled();

    rerender(
      <Harness bridge client={client} contextRef={context} store={store} />,
    );
    await act(flushMicrotasks);

    expect(client.readRawRecord).toHaveBeenCalledTimes(1);
  });

  it("clears published records when the bridge unmounts", async () => {
    const client = createClient();
    const context = createContextRef();
    const { rerender } = render(
      <Harness client={client} contextRef={context} />,
    );

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("ready");

    rerender(<Harness bridge={false} client={client} contextRef={context} />);
    await act(flushMicrotasks);

    expect(context.current?.recordsByStream.size).toBe(0);
    expect(context.current?.streams).toEqual({ status: "idle", streams: [] });
  });
});

describe("RawMessageBridge streams", () => {
  it("reads the inventory once and maps picker rows", async () => {
    const client = createClient({
      listRawRecordStreams: vi.fn(async () => [
        rawStream("/lidar", "protobuf", "foxglove.PointCloud", 42),
        rawStream("/imu", "ros1", null, null),
      ]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);

    await act(async () => {
      context.current?.ensureStreams();
      context.current?.ensureStreams();
      await flushMicrotasks();
    });

    expect(client.listRawRecordStreams).toHaveBeenCalledTimes(1);
    expect(context.current?.streams.status).toBe("ready");
    expect(context.current?.streams.streams).toEqual([
      {
        encoding: "protobuf",
        sampleCount: 42,
        schemaName: "foxglove.PointCloud",
        sourceName: "/lidar",
        streamId: "/lidar",
      },
      {
        encoding: "ros1",
        sampleCount: null,
        schemaName: null,
        sourceName: "/imu",
        streamId: "/imu",
      },
    ]);
  });

  it("retries inventory after an error resets the one-shot gate", async () => {
    const stream = rawStream("/imu", "ros1", null, 1);
    const client = createClient({
      listRawRecordStreams: vi
        .fn<RawRecordCapability["listRawRecordStreams"]>()
        .mockRejectedValueOnce(new Error("inventory failed"))
        .mockResolvedValueOnce([stream]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);

    await act(async () => {
      context.current?.ensureStreams();
      context.current?.ensureStreams();
      await flushMicrotasks();
    });
    expect(client.listRawRecordStreams).toHaveBeenCalledOnce();
    expect(context.current?.streams.status).toBe("error");

    await act(async () => {
      context.current?.ensureStreams();
      await flushMicrotasks();
    });
    expect(client.listRawRecordStreams).toHaveBeenCalledTimes(2);
    expect(context.current?.streams).toEqual({
      status: "ready",
      streams: [stream],
    });
  });

  it("replays inventory demand registered before the bridge mounts", async () => {
    const client = createClient();
    const context = createContextRef();
    const { rerender } = render(
      <Harness bridge={false} client={client} contextRef={context} />,
    );

    act(() => context.current?.ensureStreams());
    expect(client.listRawRecordStreams).not.toHaveBeenCalled();

    rerender(<Harness bridge client={client} contextRef={context} />);
    await act(flushMicrotasks);

    expect(client.listRawRecordStreams).toHaveBeenCalledOnce();
    expect(context.current?.streams.status).toBe("ready");
  });
});

function Harness({
  bridge = true,
  client,
  contextRef,
  store,
}: {
  readonly bridge?: boolean;
  readonly client: RawRecordCapability;
  readonly contextRef: { current: RawMessageContextValue | null };
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <RawMessageProvider>
      <DataStreamProvider>
        <FakeDataStream />
        {bridge ? (
          <RawMessageBridge capability={client} sourceKey="test" />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </DataStreamProvider>
    </RawMessageProvider>
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
  const setDataStream = useSetDataStream();
  // This effect publishes a synthetic data-stream handle whose timeline
  // index spans [0, 7200s] — the bridge only reads getTimelineIndex().
  useEffect(() => {
    const timeline = createTimelineIndex({
      endNs: 7_200_000_000_000n,
      startNs: 0n,
    });
    const stream: DataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => timeline,
      sourceKey: "test",
      subscribeToStream: () => () => undefined,
    };
    setDataStream(stream);
    return () => setDataStream(null);
  }, [setDataStream]);
  return null;
}

function ContextProbe({
  contextRef,
}: {
  readonly contextRef: { current: RawMessageContextValue | null };
}) {
  const value = useRawMessageContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): {
  current: RawMessageContextValue | null;
} {
  return { current: null };
}

/**
 * Fake result granting a 10s validity window from the requested time.
 */
function recordResult(
  request: Parameters<RawRecordCapability["readRawRecord"]>[0],
): RawRecordResult {
  return {
    encoding: "json",
    payloadBytes: 12,
    root: {
      entries: [["v", { kind: "scalar", value: "1", valueType: "number" }]],
      kind: "object",
    },
    schemaName: "test.State",
    sequence: 1,
    sourceName: request.stream,
    sourceTimestamps: {
      logTime: request.timestampNs,
      publishTime: request.timestampNs,
    },
    status: "ok",
    streamId: request.stream,
    timestampNs: request.timestampNs,
    validFromNs: request.timestampNs,
    validUntilNs: request.timestampNs + 10_000_000_000n,
  };
}

function rawStream(
  streamId: string,
  encoding: string,
  schemaName: string | null,
  sampleCount: number | null,
): RawRecordStream {
  return {
    encoding,
    sampleCount,
    schemaName,
    sourceName: streamId,
    streamId,
  };
}

function createClient(
  overrides: Partial<RawRecordCapability> = {},
): RawRecordCapability {
  return {
    listRawRecordStreams: vi.fn(async () => []),
    readRawRecord: vi.fn(async (request) => recordResult(request)),
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const PLAYHEAD_THROTTLE_FOR_TEST_MS = 300;
