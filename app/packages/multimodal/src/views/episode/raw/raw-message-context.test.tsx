import { playheadAtom, seekEventAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTimelineIndex,
  DEMAND_FAILURE_BACKOFF_MS,
  type DataStream,
} from "../../../runtime";
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
      intent: "export",
      signal: expect.any(AbortSignal),
      stream: "/imu",
      timestampNs: 42_000_000_000n,
    });
  });

  it("routes exact Browse reads directly through the capability", async () => {
    const exactResult: RawRecordResult = {
      ...recordResult({ stream: "/imu", timestampNs: 42n }),
      cursor: "cursor-42",
      fullJson: '{"exact":true}',
    };
    const readRawRecordAtCursor = vi.fn(async () => exactResult);
    const indexResult = {
      entries: [{ cursor: "cursor-42", timestampNs: 42n }],
      hasNext: false,
      hasPrevious: false,
      selectedCursor: "cursor-42",
    };
    let resolveIndex!: (result: typeof indexResult) => void;
    const readRawRecordIndexWindow = vi.fn<
      (
        request: Parameters<
          NonNullable<RawRecordCapability["readRawRecordIndexWindow"]>
        >[0],
      ) => Promise<typeof indexResult>
    >(
      (_request) =>
        new Promise<typeof indexResult>((resolve) => {
          resolveIndex = resolve;
        }),
    );
    const client = createClient({
      readRawRecordAtCursor,
      readRawRecordIndexWindow,
    });
    const context = createContextRef();
    const controller = new AbortController();

    render(<Harness client={client} contextRef={context} />);
    await act(flushMicrotasks);
    const rawContext = context.current;
    if (!rawContext) throw new Error("Expected raw message context");
    let indexRead!: Promise<unknown>;
    await act(async () => {
      indexRead = rawContext.readRecordIndexWindow(
        "/imu",
        { after: 10, anchorCursor: "cursor-42", before: 10 },
        controller.signal,
      );
      await flushMicrotasks();
    });
    const forwardedIndexSignal = readRawRecordIndexWindow.mock.calls[0]?.[0]
      .signal as AbortSignal | undefined;
    expect(forwardedIndexSignal?.aborted).toBe(false);

    controller.abort();
    expect(forwardedIndexSignal?.aborted).toBe(true);
    resolveIndex(indexResult);
    await act(async () => indexRead);

    const exactController = new AbortController();
    await act(async () => {
      await rawContext.readRecordAtCursor(
        "/imu",
        "cursor-42",
        exactController.signal,
      );
      await rawContext.readFullMessageJson(
        "/imu",
        "cursor-42",
        exactController.signal,
      );
    });

    expect(readRawRecordIndexWindow).toHaveBeenCalledWith({
      after: 10,
      anchorCursor: "cursor-42",
      before: 10,
      signal: expect.any(AbortSignal),
      stream: "/imu",
    });
    expect(readRawRecordAtCursor).toHaveBeenCalledTimes(2);
    expect(readRawRecordAtCursor).toHaveBeenLastCalledWith({
      cursor: "cursor-42",
      includeFullJson: true,
      signal: expect.any(AbortSignal),
      stream: "/imu",
    });
    expect(client.readRawRecord).not.toHaveBeenCalled();
  });

  it("rejects exact copy JSON returned for a different cursor", async () => {
    const client = createClient({
      readRawRecordAtCursor: vi.fn(async () => ({
        ...recordResult({ stream: "/imu", timestampNs: 43n }),
        cursor: "cursor-43",
        fullJson: '{"wrong":true}',
      })),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);
    await act(flushMicrotasks);

    await expect(
      context.current?.readFullMessageJson("/imu", "cursor-42"),
    ).rejects.toThrow("Exact message copy returned a different cursor");
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

  it("supersedes an in-flight read immediately for a paused frame step", async () => {
    const first = deferred<RawRecordResult>();
    const second = deferred<RawRecordResult>();
    const requests: Parameters<RawRecordCapability["readRawRecord"]>[0][] = [];
    const client = createClient({
      readRawRecord: vi.fn((request) => {
        requests.push(request);
        return requests.length === 1 ? first.promise : second.promise;
      }),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);
    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.intent).toBe("background");

    await act(async () => {
      store.set(playheadAtom, 300);
      store.set(seekEventAtom, { seq: 1, time: 300 });
      await flushMicrotasks();
    });

    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      intent: "paused-inspection",
      timestampNs: 300_000_000_000n,
    });
    expect(context.current?.recordsByStream.get("/imu")).toMatchObject({
      status: "loading",
      targetNs: 300_000_000_000n,
    });

    const firstRequest = requests[0];
    const secondRequest = requests[1];
    if (!firstRequest || !secondRequest) {
      throw new Error("expected both superseded raw requests");
    }
    first.resolve(recordResult(firstRequest));
    await act(flushMicrotasks);
    expect(
      context.current?.recordsByStream.get("/imu")?.result,
    ).toBeUndefined();

    second.resolve(recordResult(secondRequest));
    await act(flushMicrotasks);
    expect(context.current?.recordsByStream.get("/imu")).toMatchObject({
      result: { timestampNs: 300_000_000_000n },
      status: "ready",
      targetNs: 300_000_000_000n,
    });
  });

  it("does not loop when a reader returns an invalid window for its exact target", async () => {
    const client = createClient({
      readRawRecord: vi.fn(async (request) => ({
        ...recordResult(request),
        validFromNs: 0n,
        validUntilNs: 1n,
      })),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(<Harness client={client} contextRef={context} store={store} />);
    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    await act(flushMicrotasks);

    expect(client.readRawRecord).toHaveBeenCalledOnce();
    expect(context.current?.recordsByStream.get("/imu")).toMatchObject({
      error: "Message reader returned an invalid validity window",
      status: "error",
      targetNs: 60_000_000_000n,
    });
  });

  it("retries a paused failed refresh after backoff without another move", async () => {
    vi.useFakeTimers();
    const client = createClient({
      readRawRecord: vi
        .fn<RawRecordCapability["readRawRecord"]>()
        .mockRejectedValueOnce(new Error("temporary failure"))
        .mockImplementation(async (request) => recordResult(request)),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} />);
    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("error");
    expect(client.readRawRecord).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEMAND_FAILURE_BACKOFF_MS - 1);
      await flushMicrotasks();
    });
    expect(client.readRawRecord).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
    });
    expect(client.readRawRecord).toHaveBeenCalledTimes(2);
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe("ready");
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

  it("clears the previous record before a new source epoch can paint", async () => {
    const firstClient = createClient();
    const pending = deferred<RawRecordResult>();
    const secondClient = createClient({
      readRawRecord: vi.fn(() => pending.promise),
    });
    const context = createContextRef();
    const { rerender } = render(
      <Harness
        client={firstClient}
        contextRef={context}
        sourceKey="source-a"
      />,
    );

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(context.current?.recordsByStream.get("/imu")?.result).toBeDefined();

    rerender(
      <Harness
        client={secondClient}
        contextRef={context}
        sourceKey="source-b"
      />,
    );
    await act(flushMicrotasks);

    expect(
      context.current?.recordsByStream.get("/imu")?.result,
    ).toBeUndefined();
    expect(context.current?.recordsByStream.get("/imu")?.status).toBe(
      "loading",
    );
  });

  it("aborts an active record read on unmount and ignores its late result", async () => {
    const pending = deferred<RawRecordResult>();
    let readSignal: AbortSignal | undefined;
    const client = createClient({
      readRawRecord: vi.fn(async (request) => {
        readSignal = request.signal;
        return pending.promise;
      }),
    });
    const context = createContextRef();
    const { rerender } = render(
      <Harness client={client} contextRef={context} />,
    );

    await act(async () => {
      context.current?.subscribeRecord("/imu");
      await flushMicrotasks();
    });
    expect(readSignal?.aborted).toBe(false);

    rerender(<Harness bridge={false} client={client} contextRef={context} />);
    await act(flushMicrotasks);
    expect(readSignal?.aborted).toBe(true);

    pending.resolve(
      recordResult({
        stream: "/imu",
        timestampNs: 0n,
      }),
    );
    await act(flushMicrotasks);
    expect(context.current?.recordsByStream.size).toBe(0);
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
  sourceKey = "test",
  store,
}: {
  readonly bridge?: boolean;
  readonly client: RawRecordCapability;
  readonly contextRef: { current: RawMessageContextValue | null };
  readonly sourceKey?: string;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <RawMessageProvider>
      <DataStreamProvider>
        <FakeDataStream />
        {bridge ? (
          <RawMessageBridge capability={client} sourceKey={sourceKey} />
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

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
