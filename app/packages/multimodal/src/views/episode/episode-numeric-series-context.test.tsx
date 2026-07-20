import { playheadAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTimelineIndex,
  EpisodeDataStreamProvider,
  useSetEpisodeDataStream,
  type EpisodeDataStream,
} from "../../runtime";
import type { NumericSeriesResult, NumericStreamFields } from "../../ir";
import type { NumericSeriesCapability } from "../../ports";
import {
  EpisodeNumericSeriesBridge,
  EpisodeNumericSeriesProvider,
  episodeNumericSeriesKey,
  useEpisodeNumericSeriesContext,
  type EpisodeNumericSeriesContextValue,
} from "./episode-numeric-series-context";

const FIELD_SELECTION_DEBOUNCE_MS = 250;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("EpisodeNumericSeriesBridge (no playback store: unbounded fallback)", () => {
  it("debounces subscriptions and coalesces them per stream", async () => {
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
        fields: ["twist.linear.x", "twist.linear.y"],
        stream: "/odom",
      }),
    );
    expect(client.readNumericSeries).toHaveBeenCalledWith(
      expect.objectContaining({ fields: ["accel.z"], stream: "/imu" }),
    );
    // Fallback mode uses the shared inclusive full-coverage sentinel.
    const request = requestOf(client, 0);
    expect(request.window.startNs).toBe(0n);
    expect(request.window.endNs).toBe(1n << 62n);
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
      episodeNumericSeriesKey("/odom", "speed"),
    );
    expect(state?.status).toBe("ready");
    expect([...(state?.values ?? [])]).toEqual([1, 2]);
  });

  it("marks failed series with an error and retries on new demand", async () => {
    const source = createSource();
    const client = createClient({
      readNumericSeries: vi
        .fn<NumericSeriesCapability["readNumericSeries"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(async (request) =>
          seriesResult(request.stream, request.fields),
        ),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(
      context.current?.seriesByKey.get(
        episodeNumericSeriesKey("/odom", "speed"),
      )?.status,
    ).toBe("error");

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(
      context.current?.seriesByKey.get(
        episodeNumericSeriesKey("/odom", "speed"),
      )?.status,
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
      context.current?.enumeration.streams.map((stream) => stream.sourceName),
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

describe("EpisodeNumericSeriesBridge bounded stream prefetch", () => {
  it("prefetches every /imu field once and serves later selections from cache", async () => {
    const source = createSource();
    const stream = createNumericStream("/imu", 10);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [stream]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field0");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    expect(requestOf(client, 0).fields).toEqual(
      stream.fields.map((field) => field.path),
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field9");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(1);
    expect(
      context.current?.seriesByKey.get(
        episodeNumericSeriesKey("/imu", "field9"),
      )?.status,
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

  it("coalesces selected fields without prefetching a stream over 2 MiB", async () => {
    const source = createSource();
    const stream = createNumericStream("/wide", 33);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [stream]),
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
    expect(requestOf(client, 0).fields).toEqual(["field0", "field1"]);
  });

  it("stops speculative prefetch at the 8 MiB source budget", async () => {
    const source = createSource();
    const streams = [
      createNumericStream("/stream0", 32),
      createNumericStream("/stream1", 32),
      createNumericStream("/stream2", 32),
      createNumericStream("/stream3", 32),
      createNumericStream("/stream4", 10),
    ];
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => streams),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);
    await enumerateFields(context);

    await act(async () => {
      for (const stream of streams) {
        context.current?.subscribeSeries(stream.streamId, "field0");
      }
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(5);
    for (let index = 0; index < 4; index += 1) {
      expect(requestForStream(client, `/stream${index}`).fields).toHaveLength(
        32,
      );
    }
    expect(requestForStream(client, "/stream4").fields).toEqual(["field0"]);
  });

  it("rolls back failed speculative coverage without publishing hidden errors", async () => {
    const source = createSource();
    const stream = createNumericStream("/imu", 2);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [stream]),
      readNumericSeries: vi
        .fn<NumericSeriesCapability["readNumericSeries"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(async (request) =>
          seriesResult(request.stream, request.fields),
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
      context.current?.seriesByKey.get(
        episodeNumericSeriesKey("/imu", "field0"),
      )?.status,
    ).toBe("error");
    expect(
      context.current?.seriesByKey.has(
        episodeNumericSeriesKey("/imu", "field1"),
      ),
    ).toBe(false);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field1");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(requestOf(client, 1).fields).toEqual(["field0", "field1"]);
    expect(
      context.current?.seriesByKey.get(
        episodeNumericSeriesKey("/imu", "field1"),
      )?.status,
    ).toBe("ready");
  });

  it("resets prefetched coverage when the episode source changes", async () => {
    const stream = createNumericStream("/imu", 10);
    const client = createClient({
      enumerateNumericFields: vi.fn(async () => [stream]),
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
    expect(requestOf(client, 1).fields).toHaveLength(10);
  });
});

describe("EpisodeNumericSeriesBridge (playback store: windowed fetches)", () => {
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
    expect(request.window.startNs).toBe(30_000_000_000n);
    expect(request.window.endNs).toBe(89_999_999_999n);
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
        async (
          request: Parameters<NumericSeriesCapability["readNumericSeries"]>[0],
        ) => ({
          baseTimeNs: 0n,
          fields: request.fields.map((path) => ({
            path,
            timesSec: Float64Array.from([Number(request.window.startNs) / 1e9]),
            values: Float64Array.from([1]),
          })),
          sampleCount: 1,
          streamId: request.stream,
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
      episodeNumericSeriesKey("/imu", "accel.x"),
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
  readonly client: NumericSeriesCapability;
  readonly contextRef: { current: EpisodeNumericSeriesContextValue | null };
  readonly durationSec?: number;
  readonly source: string | null;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <EpisodeNumericSeriesProvider>
      <EpisodeDataStreamProvider>
        {durationSec !== undefined ? (
          <FakeDataStream durationSec={durationSec} />
        ) : null}
        {bridge ? (
          <EpisodeNumericSeriesBridge capability={client} sourceKey={source} />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </EpisodeDataStreamProvider>
    </EpisodeNumericSeriesProvider>
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
  const setDataStream = useSetEpisodeDataStream();
  // This effect publishes a synthetic data-stream handle whose timeline
  // index spans [0, durationSec] — the bridge only reads
  // getTimelineIndex().
  useEffect(() => {
    const timeline = createTimelineIndex({
      endNs: BigInt(durationSec) * 1_000_000_000n,
      startNs: 0n,
    });
    const stream: EpisodeDataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => timeline,
      sourceKey: "test",
      subscribeToStream: () => () => undefined,
    };
    setDataStream(stream);
    return () => setDataStream(null);
  }, [durationSec, setDataStream]);
  return null;
}

function ContextProbe({
  contextRef,
}: {
  readonly contextRef: { current: EpisodeNumericSeriesContextValue | null };
}) {
  const value = useEpisodeNumericSeriesContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): {
  current: EpisodeNumericSeriesContextValue | null;
} {
  return { current: null };
}

function requestOf(
  client: NumericSeriesCapability,
  call: number,
): Parameters<NumericSeriesCapability["readNumericSeries"]>[0] {
  return vi.mocked(client.readNumericSeries).mock.calls[call][0];
}

function seriesResult(
  streamId: string,
  fields: readonly string[],
): NumericSeriesResult {
  return {
    baseTimeNs: 0n,
    fields: fields.map((path) => ({
      path,
      timesSec: Float64Array.from([0, 1]),
      values: Float64Array.from([1, 2]),
    })),
    sampleCount: 2,
    streamId,
    truncated: false,
  };
}

function createClient(
  overrides: Partial<NumericSeriesCapability> = {},
): NumericSeriesCapability {
  return {
    enumerateNumericFields: vi.fn(async () => [
      {
        availability: "ready" as const,
        encoding: "protobuf",
        fields: [{ path: "speed", valueType: "double" }],
        sourceName: "/odom",
        streamId: "/odom",
      },
    ]),
    readNumericSeries: vi.fn(async (request) =>
      seriesResult(request.stream, request.fields),
    ),
    ...overrides,
  };
}

function createNumericStream(
  stream: string,
  fieldCount: number,
): NumericStreamFields {
  return {
    availability: "ready",
    encoding: "cdr",
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      path: `field${index}`,
      valueType: "double",
    })),
    sourceName: stream,
    streamId: stream,
  };
}

async function enumerateFields(context: {
  current: EpisodeNumericSeriesContextValue | null;
}): Promise<void> {
  await act(async () => {
    context.current?.ensureEnumeration();
    await flushMicrotasks();
  });
}

function requestForStream(
  client: NumericSeriesCapability,
  stream: string,
): Parameters<NumericSeriesCapability["readNumericSeries"]>[0] {
  const call = vi
    .mocked(client.readNumericSeries)
    .mock.calls.find(([request]) => request.stream === stream);
  if (!call) {
    throw new Error(`No numeric-series request for ${stream}`);
  }
  return call[0];
}

function createSource(sourceId = "test"): string {
  return sourceId;
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
