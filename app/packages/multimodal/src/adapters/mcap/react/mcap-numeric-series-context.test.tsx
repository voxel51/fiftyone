import { playheadAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type {
  McapNumericSeriesResult,
  McapReadNumericSeriesRequest,
  McapResourceClient,
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
import type { McapTimelineIndex } from "./mcap-timeline-index";

afterEach(() => {
  cleanup();
});

describe("McapNumericSeriesBridge (no playback store: unbounded fallback)", () => {
  it("coalesces same-tick subscriptions per topic into one bulk read", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.subscribeSeries("/odom", "twist.linear.x");
      context.current?.subscribeSeries("/odom", "twist.linear.y");
      context.current?.subscribeSeries("/imu", "accel.z");
      await flushMicrotasks();
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
      await flushMicrotasks();
    });
    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await flushMicrotasks();
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
      await flushMicrotasks();
    });
    expect(
      context.current?.seriesByKey.get(mcapNumericSeriesKey("/odom", "speed"))
        ?.status,
    ).toBe("error");

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await flushMicrotasks();
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
    await act(flushMicrotasks);

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
  });
});

describe("McapNumericSeriesBridge (playback store: windowed fetches)", () => {
  const DURATION_SEC = 7_200;

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
      await flushMicrotasks();
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
      await flushMicrotasks();
    });
    // A second tile subscribing to the same signal at the same playhead
    // finds the window covered.
    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await flushMicrotasks();
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
      await flushMicrotasks();
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
    const timeline: McapTimelineIndex = {
      durationSec,
      endTimeNs: BigInt(durationSec) * 1_000_000_000n,
      nearestTick: () => undefined,
      secToNs: (sec: number) => BigInt(Math.round(sec * 1e9)),
      startTimeNs: 0n,
      ticks: [],
    };
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
