import { playheadAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapNumericSeriesResult,
  type McapReadNumericSeriesRequest,
  type McapResourceClient,
  type McapTopicNumericFields,
} from "../types";
import {
  McapDataStreamProvider,
  useSetMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import {
  McapNumericSeriesBridge,
  McapNumericSeriesProvider,
  mcapNumericSeriesKey,
  useMcapNumericSeriesContext,
  type McapNumericSeriesContextValue,
} from "./mcap-numeric-series-context";
import { createMcapTimelineIndex } from "./mcap-timeline-index";

const FIELD_SELECTION_DEBOUNCE_MS = 250;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapNumericSeriesBridge (no playback store: unbounded fallback)", () => {
  it("debounces subscriptions and coalesces them per topic", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.subscribeSeries("/odom", "twist.linear.x");
      await advanceTimers(100);
      context.current?.subscribeSeries("/odom", "twist.linear.y");
      context.current?.subscribeSeries("/imu", "accel.z");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS - 1);
    });
    expect(client.readNumericSeries).not.toHaveBeenCalled();

    await act(async () => {
      await advanceTimers(1);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(client.readNumericSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldPaths: ["twist.linear.x", "twist.linear.y"],
        topic: "/odom",
      }),
      { priority: "bulk" },
    );
    expect(client.readNumericSeries).toHaveBeenCalledWith(
      expect.objectContaining({ fieldPaths: ["accel.z"], topic: "/imu" }),
      { priority: "bulk" },
    );
    // Fallback mode has no timeline to bound against — unbounded request.
    const request = requestOf(client, 0);
    expect(request.startTimeNs).toBeUndefined();
    expect(request.endTimeNs).toBeUndefined();
  });

  it("publishes ready series and serves repeat subscriptions from cache", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    const state = context.current?.seriesByKey.get(
      mcapNumericSeriesKey("/odom", "speed"),
    );
    expect(state?.status).toBe("ready");
    expect([...(state?.values ?? [])]).toEqual([1, 2]);
  });

  it("marks failed series with an error and retries on new demand", async () => {
    const source = createSource();
    const client = createClient({
      readNumericSeries: vi
        .fn<McapResourceClient["readNumericSeries"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(async (request) =>
          seriesResult(request.topic, request.fieldPaths),
        ),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/odom", "speed"))
        ?.status,
    ).toBe("error");

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/odom", "speed"))
        ?.status,
    ).toBe("ready");
  });

  it("runs the enumeration once and publishes it", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.ensureEnumeration();
      context.current?.ensureEnumeration();
      await flushMicrotasks();
    });

    expect(client.enumerateNumericFields).toHaveBeenCalledTimes(1);
    expect(context.current?.enumeration.status).toBe("ready");
    expect(
      context.current?.enumeration.topics.map((topic) => topic.topic),
    ).toEqual(["/odom"]);
  });

  it("services interest registered before the bridge mounted", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    const { rerender } = render(
      <Harness
        bridge={false}
        client={client}
        contextRef={context}
        source={source}
      />,
    );

    act(() => {
      context.current?.subscribeSeries("/odom", "speed");
    });
    expect(client.readNumericSeries).not.toHaveBeenCalled();

    rerender(
      <Harness bridge client={client} contextRef={context} source={source} />,
    );
    await act(async () => {
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
  });
});

describe("McapNumericSeriesBridge bounded topic prefetch", () => {
  it("prefetches every /imu field once and serves later selections from cache", async () => {
    const source = createSource();
    const topic = createNumericTopic("/imu", 10);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [topic]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field0");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    expect(requestOf(client, 0).fieldPaths).toEqual(
      topic.fields.map((field) => field.path),
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field9");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/imu", "field9"))
        ?.status,
    ).toBe("ready");
  });

  it("drops demand removed before the trailing debounce fires", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    let unsubscribe: () => void = () => undefined;
    await act(async () => {
      unsubscribe =
        context.current?.subscribeSeries("/odom", "speed") ?? unsubscribe;
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS - 1);
      unsubscribe();
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).not.toHaveBeenCalled();
  });

  it("cancels a pending demand fill when the source changes", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();
    const { rerender } = render(
      <Harness client={client} contextRef={context} source={source} />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS - 1);
    });
    act(() => {
      rerender(<Harness client={client} contextRef={context} source={null} />);
    });
    await act(async () => {
      await advanceTimers(1);
    });

    expect(client.readNumericSeries).not.toHaveBeenCalled();
  });

  it("coalesces selected fields without prefetching a topic over 2 MiB", async () => {
    const source = createSource();
    const topic = createNumericTopic("/wide", 33);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [topic]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      context.current?.subscribeSeries("/wide", "field0");
      await advanceTimers(100);
      context.current?.subscribeSeries("/wide", "field1");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    expect(requestOf(client, 0).fieldPaths).toEqual(["field0", "field1"]);
  });

  it("stops speculative prefetch at the 8 MiB source budget", async () => {
    const source = createSource();
    const topics = [
      createNumericTopic("/topic0", 32),
      createNumericTopic("/topic1", 32),
      createNumericTopic("/topic2", 32),
      createNumericTopic("/topic3", 32),
      createNumericTopic("/topic4", 10),
    ];
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => topics),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      for (const topic of topics) {
        context.current?.subscribeSeries(topic.topic, "field0");
      }
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(5);
    for (let index = 0; index < 4; index += 1) {
      expect(requestForTopic(client, `/topic${index}`).fieldPaths).toHaveLength(
        32,
      );
    }
    expect(requestForTopic(client, "/topic4").fieldPaths).toEqual(["field0"]);
  });

  it("rolls back failed speculative coverage without publishing hidden errors", async () => {
    const source = createSource();
    const topic = createNumericTopic("/imu", 2);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [topic]),
      readNumericSeries: vi
        .fn<McapResourceClient["readNumericSeries"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(async (request) =>
          seriesResult(request.topic, request.fieldPaths),
        ),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field0");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/imu", "field0"))
        ?.status,
    ).toBe("error");
    expect(
      context.current?.seriesByKey.has(mcapNumericSeriesKey("/imu", "field1")),
    ).toBe(false);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field1");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(requestOf(client, 1).fieldPaths).toEqual(["field0", "field1"]);
    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/imu", "field1"))
        ?.status,
    ).toBe("ready");
  });

  it("resets prefetched coverage when the MCAP source changes", async () => {
    const topic = createNumericTopic("/imu", 10);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [topic]),
    });
    const context = createContextRef();
    const { rerender } = render(
      <Harness
        client={client}
        contextRef={context}
        source={createSource("first")}
      />,
    );
    await enumerateFields(context);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field0");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    act(() => {
      rerender(
        <Harness
          client={client}
          contextRef={context}
          source={createSource("second")}
        />,
      );
    });
    await act(async () => {
      await flushMicrotasks();
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(requestOf(client, 1).fieldPaths).toHaveLength(10);
  });
});

describe("McapNumericSeriesBridge (playback store: windowed fetches)", () => {
  const DURATION_SEC = 7_200;

  it("does not debounce a playhead-driven fill", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={source}
        store={store}
      />,
    );

    act(() => {
      context.current?.subscribeSeries("/imu", "accel.x");
    });
    expect(client.readNumericSeries).not.toHaveBeenCalled();

    await act(async () => {
      store.set(playheadAtom, 61);
      await flushMicrotasks();
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
  });

  it("fetches a quantized window centered on the playhead", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={source}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    const request = requestOf(client, 0);
    // Playhead 60s, half-window 30s, quantized to the 15s grid.
    expect(request.startTimeNs).toBe(30_000_000_000n);
    expect(request.endTimeNs).toBe(89_999_999_999n);
    // Point budget proportional to the window's share of the recording,
    // floored.
    expect(request.maxPointsPerField).toBe(200);
  });

  it("never refetches a covered window", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={source}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    // A second tile subscribing to the same signal at the same playhead
    // finds the window covered.
    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
  });

  it("accumulates disjoint windows as gap-separated segments", async () => {
    const source = createSource();
    const client = createClient({
      readNumericSeries: vi.fn(
        async (request: McapReadNumericSeriesRequest) => ({
          baseTimeNs: 0n,
          fields: request.fieldPaths.map((path) => ({
            path,
            timesSec: Float64Array.from([
              Number(request.startTimeNs ?? 0n) / 1e9,
            ]),
            values: Float64Array.from([1]),
          })),
          messageCount: 1,
          topic: request.topic,
          truncated: false,
        }),
      ),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={source}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    // Seek far away: the playhead subscription triggers a fill for the
    // new (disjoint) window.
    await act(async () => {
      store.set(playheadAtom, 1_800);
      await flushMicrotasks();
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    const state = context.current?.seriesByKey.get(
      mcapNumericSeriesKey("/imu", "accel.x"),
    );
    expect(state?.status).toBe("ready");
    // One sample per window plus one NaN gap marker between them.
    expect(state?.timesSec?.length).toBe(3);
    expect(state?.values?.[1]).toBeNaN();
  });
});

function Harness({
  bridge = true,
  client,
  contextRef,
  durationSec,
  source,
  store,
}: {
  readonly bridge?: boolean;
  readonly client: McapResourceClient;
  readonly contextRef: { current: McapNumericSeriesContextValue | null };
  readonly durationSec?: number;
  readonly source: ByteSourceDescriptor | null;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <McapNumericSeriesProvider>
      <McapDataStreamProvider>
        {durationSec !== undefined ? (
          <FakeDataStream durationSec={durationSec} />
        ) : null}
        {bridge ? (
          <McapNumericSeriesBridge client={client} source={source} />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </McapDataStreamProvider>
    </McapNumericSeriesProvider>
  );
  return store ? (
    <PlaybackStoreContext.Provider value={store}>
      {body}
    </PlaybackStoreContext.Provider>
  ) : (
    body
  );
}

function FakeDataStream({ durationSec }: { readonly durationSec: number }) {
  const setDataStream = useSetMcapDataStream();
  // This effect publishes a synthetic data-stream handle whose timeline
  // index spans [0, durationSec] — the bridge only reads
  // getTimelineIndex().
  useEffect(() => {
    const timeline = createMcapTimelineIndex({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: BigInt(durationSec) * 1_000_000_000n,
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
  }, [durationSec, setDataStream]);
  return null;
}

function ContextProbe({
  contextRef,
}: {
  readonly contextRef: { current: McapNumericSeriesContextValue | null };
}) {
  const value = useMcapNumericSeriesContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): { current: McapNumericSeriesContextValue | null } {
  return { current: null };
}

function requestOf(
  client: McapResourceClient,
  call: number,
): McapReadNumericSeriesRequest {
  return vi.mocked(client.readNumericSeries).mock.calls[call][0];
}

function seriesResult(
  topic: string,
  fieldPaths: readonly string[],
): McapNumericSeriesResult {
  return {
    baseTimeNs: 0n,
    fields: fieldPaths.map((path) => ({
      path,
      timesSec: Float64Array.from([0, 1]),
      values: Float64Array.from([1, 2]),
    })),
    messageCount: 2,
    topic,
    truncated: false,
  };
}

function createClient(
  overrides: Partial<McapResourceClient> = {},
): McapResourceClient {
  return {
    dispose: vi.fn(),
    enumerateNumericFields: vi.fn(async () => [
      {
        availability: "ready" as const,
        encoding: "protobuf" as const,
        fields: [{ path: "speed", valueType: "double" }],
        topic: "/odom",
      },
    ]),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readNumericSeries: vi.fn(async (request: McapReadNumericSeriesRequest) =>
      seriesResult(request.topic, request.fieldPaths),
    ),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readRawMessageRecord: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
    ...overrides,
  };
}

function createNumericTopic(
  topic: string,
  fieldCount: number,
): McapTopicNumericFields {
  return {
    availability: "ready",
    encoding: "cdr",
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      path: `field${index}`,
      valueType: "double",
    })),
    topic,
  };
}

async function enumerateFields(context: {
  current: McapNumericSeriesContextValue | null;
}): Promise<void> {
  await act(async () => {
    context.current?.ensureEnumeration();
    await flushMicrotasks();
  });
}

function requestForTopic(
  client: McapResourceClient,
  topic: string,
): McapReadNumericSeriesRequest {
  const call = vi
    .mocked(client.readNumericSeries)
    .mock.calls.find(([request]) => request.topic === topic);
  if (!call) {
    throw new Error(`No numeric-series request for ${topic}`);
  }
  return call[0];
}

function createSource(sourceId = "test"): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap` };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceTimers(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flushMicrotasks();
}
