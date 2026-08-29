import { playheadAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex, type DataStream } from "../../../runtime";
import { DataStreamProvider, useSetDataStream } from "../../../runtime/react";
import type { NumericSeriesResult, NumericStreamFields } from "../../../ir";
import type {
  NumericSeriesCapability,
  NumericSeriesSliceRequest,
  NumericSeriesSliceResult,
  ReadContinuation,
  ReadWorkUsage,
} from "../../../ports";
import {
  NumericSeriesBridge,
  NumericSeriesProvider,
  numericSeriesKey,
  useNumericSeriesContext,
  type NumericSeriesContextValue,
} from "./numeric-series-context";

const FIELD_SELECTION_DEBOUNCE_MS = 250;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NumericSeriesBridge (no playback store: unbounded fallback)", () => {
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
      numericSeriesKey("/odom", "speed"),
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
      context.current?.seriesByKey.get(numericSeriesKey("/odom", "speed"))
        ?.status,
    ).toBe("error");

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(
      context.current?.seriesByKey.get(numericSeriesKey("/odom", "speed"))
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
      context.current?.enumeration.streams.map((stream) => stream.sourceName),
    ).toEqual(["/odom"]);
  });

  it("retries enumeration after an error resets the one-shot gate", async () => {
    const source = createSource();
    const stream = createNumericStream("/odom", 1);
    const client = createClient({
      enumerateNumericFields: vi
        .fn<NumericSeriesCapability["enumerateNumericFields"]>()
        .mockRejectedValueOnce(new Error("enumeration failed"))
        .mockResolvedValueOnce([stream]),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.ensureEnumeration();
      context.current?.ensureEnumeration();
      await flushMicrotasks();
    });
    expect(client.enumerateNumericFields).toHaveBeenCalledOnce();
    expect(context.current?.enumeration.status).toBe("error");

    await act(async () => {
      context.current?.ensureEnumeration();
      await flushMicrotasks();
    });
    expect(client.enumerateNumericFields).toHaveBeenCalledTimes(2);
    expect(context.current?.enumeration.status).toBe("ready");
  });

  it("publishes schema fields before bounded fallback augmentation", async () => {
    const source = createSource();
    const schemaStream: NumericStreamFields = {
      availability: "ready",
      encoding: "protobuf",
      fields: [{ path: "speed", valueType: "double" }],
      sampled: true,
      sourceName: "/odom",
      streamId: "/odom",
    };
    const augmentedStream: NumericStreamFields = {
      ...schemaStream,
      fields: [
        ...schemaStream.fields,
        { path: "position.0", valueType: "number" },
      ],
    };
    let resolveFallback:
      | ((streams: readonly NumericStreamFields[]) => void)
      | undefined;
    const fallback = new Promise<readonly NumericStreamFields[]>((resolve) => {
      resolveFallback = resolve;
    });
    const client = createClient({
      enumerateNumericFields: vi.fn(async (_streams, options) =>
        options?.includeDataFallback === false ? [schemaStream] : fallback,
      ),
    });
    const context = createContextRef();

    render(<Harness client={client} contextRef={context} source={source} />);

    await act(async () => {
      context.current?.ensureEnumeration();
      await flushMicrotasks();
    });

    expect(client.enumerateNumericFields).toHaveBeenCalledTimes(2);
    expect(context.current?.enumeration.streams).toEqual([schemaStream]);

    await act(async () => {
      resolveFallback?.([augmentedStream]);
      await flushMicrotasks();
    });

    expect(context.current?.enumeration.streams).toEqual([augmentedStream]);
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

  it("replays enumeration requested before the bridge mounts", async () => {
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

    act(() => context.current?.ensureEnumeration());
    expect(client.enumerateNumericFields).not.toHaveBeenCalled();

    rerender(
      <Harness bridge client={client} contextRef={context} source={source} />,
    );
    await act(flushMicrotasks);

    expect(client.enumerateNumericFields).toHaveBeenCalledOnce();
    expect(context.current?.enumeration.status).toBe("ready");
  });

  it("clears published series when the bridge unmounts", async () => {
    const source = createSource();
    const client = createClient();
    const context = createContextRef();
    const { rerender } = render(
      <Harness client={client} contextRef={context} source={source} />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(context.current?.seriesByKey.size).toBe(1);

    rerender(
      <Harness
        bridge={false}
        client={client}
        contextRef={context}
        source={source}
      />,
    );
    await act(flushMicrotasks);

    expect(context.current?.seriesByKey.size).toBe(0);
    expect(context.current?.enumeration).toEqual({
      status: "idle",
      streams: [],
    });
  });
});

describe("NumericSeriesBridge active-field demand", () => {
  it("reads only selected fields instead of projecting an entire schema", async () => {
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
    expect(requestOf(client, 0).fields).toEqual(["field0"]);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field9");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(requestOf(client, 1).fields).toEqual(["field9"]);
    expect(
      context.current?.seriesByKey.get(numericSeriesKey("/imu", "field9"))
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

  it("keeps projection proportional to active fields across wide streams", async () => {
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
    for (let index = 0; index < streams.length; index += 1) {
      expect(requestForStream(client, `/stream${index}`).fields).toEqual([
        "field0",
      ]);
    }
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
      context.current?.seriesByKey.get(numericSeriesKey("/imu", "field0"))
        ?.status,
    ).toBe("error");
    expect(
      context.current?.seriesByKey.has(numericSeriesKey("/imu", "field1")),
    ).toBe(false);

    await act(async () => {
      context.current?.subscribeSeries("/imu", "field1");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).toHaveBeenCalledTimes(2);
    expect(requestOf(client, 1).fields).toEqual(["field0", "field1"]);
    expect(
      context.current?.seriesByKey.get(numericSeriesKey("/imu", "field1"))
        ?.status,
    ).toBe("ready");
  });

  it("resets selected-field coverage when the episode source changes", async () => {
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
    expect(requestOf(client, 1).fields).toEqual(["field0"]);
  });
});

describe("NumericSeriesBridge (playback store: windowed fetches)", () => {
  const DURATION_SEC = 7_200;

  it("batches active topics into one playhead-local bounded slice", async () => {
    const source = createSource();
    const client = createSlicedClient();
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
      context.current?.subscribeSeries("/odom", "speed");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(client.readNumericSeries).not.toHaveBeenCalled();
    expect(client.readNumericSeriesSlice).toHaveBeenCalledTimes(1);
    const request = sliceRequestOf(client, 0);
    expect(request.maxChunks).toBe(1);
    expect(request.preferredTimeNs).toBe(30_000_000_000n);
    expect(request.selections).toEqual([
      { fields: ["accel.x"], stream: "/imu" },
      { fields: ["speed"], stream: "/odom" },
    ]);
    const state = context.current?.seriesByKey.get(
      numericSeriesKey("/imu", "accel.x"),
    );
    expect(state?.status).toBe("ready");
  });

  it("publishes the first page before continuing the horizon", async () => {
    const source = createSource();
    const continuation = {} as ReadContinuation;
    let resolveSecond: ((result: NumericSeriesSliceResult) => void) | undefined;
    const second = new Promise<NumericSeriesSliceResult>((resolve) => {
      resolveSecond = resolve;
    });
    const readNumericSeriesSlice = vi
      .fn<NonNullable<NumericSeriesCapability["readNumericSeriesSlice"]>>()
      .mockImplementationOnce(async (request) =>
        sliceResult(request, {
          continuation,
          coverage: [{ endNs: 49_999_999_999n, startNs: 30_000_000_000n }],
          resumeAtNs: 50_000_000_000n,
          stopReason: "budget-exhausted",
        }),
      )
      .mockImplementationOnce(() => second);
    const client = createClient({ readNumericSeriesSlice });
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
      await flushMicrotasks();
    });

    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(2);
    expect(sliceRequestOf(client, 1).continuation).toBe(continuation);
    expect(sliceRequestOf(client, 1).maxChunks).toBe(8);
    const state = context.current?.seriesByKey.get(
      numericSeriesKey("/imu", "accel.x"),
    );
    expect(state?.status).toBe("ready");
    expect(state?.coverageSeconds).toBeGreaterThan(18);
    expect(state?.coverage?.at(-1)?.endNs).toBeLessThan(50_000_000_000n);
    expect(state?.targetSeconds).toBeCloseTo(60);
    expect(state?.values?.some(Number.isNaN) ?? false).toBe(false);

    await act(async () => {
      resolveSecond?.(
        sliceResult(sliceRequestOf(client, 1), {
          stopReason: "source-exhausted",
        }),
      );
      await flushMicrotasks();
    });
  });

  it("keeps an oversized span unavailable while acquiring later data", async () => {
    const source = createSource();
    const continuation = {} as ReadContinuation;
    const readNumericSeriesSlice = vi
      .fn<NonNullable<NumericSeriesCapability["readNumericSeriesSlice"]>>()
      .mockImplementationOnce(async (request) =>
        sliceResult(request, {
          continuation,
          coverage: [{ endNs: 39_999_999_999n, startNs: 30_000_000_000n }],
          stopReason: "oversized-source-unit",
          unavailable: [{ endNs: 49_999_999_999n, startNs: 40_000_000_000n }],
        }),
      )
      .mockImplementationOnce(async (request) =>
        sliceResult(request, {
          coverage: [{ endNs: 89_999_999_999n, startNs: 50_000_000_000n }],
          stopReason: "source-exhausted",
        }),
      );
    const client = createClient({ readNumericSeriesSlice });
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
      await flushMicrotasks();
    });

    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(2);
    expect(sliceRequestOf(client, 1).continuation).toBe(continuation);
    const state = context.current?.seriesByKey.get(
      numericSeriesKey("/imu", "accel.x"),
    );
    expect(state?.unavailable).toEqual([
      { endNs: 49_999_999_999n, startNs: 40_000_000_000n },
    ]);
    expect(state?.coverage).toEqual([
      { endNs: 39_999_999_999n, startNs: 30_000_000_000n },
      { endNs: 89_999_999_999n, startNs: 50_000_000_000n },
    ]);
    expect(state?.truncated).toBe(true);
  });

  it("backs off an empty continuation instead of spinning", async () => {
    const continuation = {} as ReadContinuation;
    const readNumericSeriesSlice = vi.fn(async (request) =>
      sliceResult(request, {
        continuation,
        coverage: [],
        stopReason: "budget-exhausted",
        usage: emptyReadUsage({ chunksOpened: 0, messagesDecoded: 0 }),
      }),
    );
    const client = createClient({ readNumericSeriesSlice });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);

    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );
    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
      await flushMicrotasks();
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(1);

    await act(async () => {
      await advanceTimers(4_999);
      await flushMicrotasks();
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(1);

    await act(async () => {
      await advanceTimers(1);
      await flushMicrotasks();
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(2);
  });

  it("yields a bounded acquisition epoch and resumes its continuation", async () => {
    const continuation = {} as ReadContinuation;
    let page = 0n;
    const readNumericSeriesSlice = vi.fn(async (request) => {
      const point = request.window.startNs + page;
      page += 1n;
      return sliceResult(request, {
        continuation,
        coverage: [
          {
            endNs: point,
            startNs: point,
          },
        ],
        stopReason: "budget-exhausted",
      });
    });
    const client = createClient({ readNumericSeriesSlice });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);
    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
      await flushMicrotasks();
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(8);

    await act(async () => {
      await advanceTimers(4_999);
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(8);

    await act(async () => {
      await advanceTimers(1);
      await flushMicrotasks();
    });
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(16);
    expect(sliceRequestOf(client, 8).continuation).toBe(continuation);
  });

  it("aborts an obsolete slice and starts the seek destination", async () => {
    const source = createSource();
    const readNumericSeriesSlice = vi.fn<
      NonNullable<NumericSeriesCapability["readNumericSeriesSlice"]>
    >(() => new Promise(() => undefined));
    const client = createClient({ readNumericSeriesSlice });
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
    const firstSignal = sliceRequestOf(client, 0).signal;

    await act(async () => {
      store.set(playheadAtom, 1_800);
      await flushMicrotasks();
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(2);
    expect(sliceRequestOf(client, 1).preferredTimeNs).toBe(1_770_000_000_000n);
  });

  it("keeps useful in-flight work across transient demand changes", async () => {
    const readNumericSeriesSlice = vi.fn<
      NonNullable<NumericSeriesCapability["readNumericSeriesSlice"]>
    >(() => new Promise(() => undefined));
    const client = createClient({ readNumericSeriesSlice });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);
    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );

    let unsubscribe: () => void = () => undefined;
    await act(async () => {
      unsubscribe =
        context.current?.subscribeSeries("/imu", "accel.x") ?? unsubscribe;
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    const signal = sliceRequestOf(client, 0).signal;

    await act(async () => {
      context.current?.subscribeSeries("/odom", "speed");
      unsubscribe();
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(signal?.aborted).toBe(false);
    expect(readNumericSeriesSlice).toHaveBeenCalledOnce();
  });

  it("loads a pinned viewport instead of following later playhead moves", async () => {
    const client = createSlicedClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);
    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );
    await act(async () => {
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 1_000,
        startSec: 1_000,
      });
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(sliceRequestOf(client, 1).window).toEqual({
      endNs: 1_020_000_000_000n,
      startNs: 1_000_000_000_000n,
    });

    await act(async () => {
      store.set(playheadAtom, 1_800);
      await advanceTimers(500);
    });
    expect(client.readNumericSeriesSlice).toHaveBeenCalledTimes(2);

    await act(async () => {
      context.current?.setViewportDemand("plot", null);
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(sliceRequestOf(client, 2).preferredTimeNs).toBe(1_770_000_000_000n);
  });

  it("refines a pinned viewport without reusing insufficient resolution", async () => {
    const client = createSlicedClient();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);
    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 100,
        startSec: 1_000,
      });
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(sliceRequestOf(client, 0).bucketDurationNs).toBe(202_020_203n);

    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 5_000,
        startSec: 1_000,
      });
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(client.readNumericSeriesSlice).toHaveBeenCalledTimes(2);
    expect(sliceRequestOf(client, 1).bucketDurationNs).toBeLessThan(
      sliceRequestOf(client, 0).bucketDurationNs,
    );

    // The finer retained tile is sufficient when demand later coarsens.
    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 500,
        startSec: 1_000,
      });
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    expect(client.readNumericSeriesSlice).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous coherent plot while a refinement is loading", async () => {
    const continuation = {} as ReadContinuation;
    let resolveFinalPage:
      | ((result: NumericSeriesSliceResult) => void)
      | undefined;
    const finalPage = new Promise<NumericSeriesSliceResult>((resolve) => {
      resolveFinalPage = resolve;
    });
    const readNumericSeriesSlice = vi
      .fn<NonNullable<NumericSeriesCapability["readNumericSeriesSlice"]>>()
      .mockImplementationOnce(async (request) =>
        sliceResult(request, { stopReason: "source-exhausted" }),
      )
      .mockImplementationOnce(async (request) =>
        sliceResult(request, {
          continuation,
          coverage: [
            {
              endNs: request.window.startNs + 9_999_999_999n,
              startNs: request.window.startNs,
            },
          ],
          resumeAtNs: request.window.startNs + 10_000_000_000n,
          stopReason: "budget-exhausted",
        }),
      )
      .mockImplementationOnce(() => finalPage);
    const client = createClient({ readNumericSeriesSlice });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 60);
    render(
      <Harness
        client={client}
        contextRef={context}
        durationSec={DURATION_SEC}
        source={createSource()}
        store={store}
      />,
    );

    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 100,
        startSec: 1_000,
      });
      context.current?.subscribeSeries("/imu", "accel.x");
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });
    const key = numericSeriesKey("/imu", "accel.x");
    const initialValues = context.current?.seriesByKey.get(key)?.values;

    await act(async () => {
      context.current?.setViewportDemand("plot", {
        endSec: 1_020,
        mode: "pinned",
        pixelWidth: 5_000,
        startSec: 1_000,
      });
      await advanceTimers(FIELD_SELECTION_DEBOUNCE_MS);
    });

    expect(readNumericSeriesSlice).toHaveBeenCalledTimes(3);
    expect(context.current?.seriesByKey.get(key)?.status).toBe("ready");
    expect(context.current?.seriesByKey.get(key)?.values).toBe(initialValues);

    await act(async () => {
      resolveFinalPage?.(
        sliceResult(sliceRequestOf(client, 2), {
          stopReason: "source-exhausted",
        }),
      );
      await flushMicrotasks();
    });
  });

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

  it("publishes only the current viewport after disjoint fills", async () => {
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
      numericSeriesKey("/imu", "accel.x"),
    );
    expect(state?.status).toBe("ready");
    expect([...(state?.timesSec ?? [])]).toEqual([1_770]);
    expect([...(state?.values ?? [])]).toEqual([1]);
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
  readonly contextRef: { current: NumericSeriesContextValue | null };
  readonly durationSec?: number;
  readonly source: string | null;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <NumericSeriesProvider>
      <DataStreamProvider>
        {durationSec !== undefined ? (
          <FakeDataStream durationSec={durationSec} />
        ) : null}
        {bridge ? (
          <NumericSeriesBridge capability={client} sourceKey={source} />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </DataStreamProvider>
    </NumericSeriesProvider>
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
  const setDataStream = useSetDataStream();
  // This effect publishes a synthetic data-stream handle whose timeline
  // index spans [0, durationSec] — the bridge only reads
  // getTimelineIndex().
  useEffect(() => {
    const timeline = createTimelineIndex({
      endNs: BigInt(durationSec) * 1_000_000_000n,
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
  }, [durationSec, setDataStream]);
  return null;
}

function ContextProbe({
  contextRef,
}: {
  readonly contextRef: { current: NumericSeriesContextValue | null };
}) {
  const value = useNumericSeriesContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): {
  current: NumericSeriesContextValue | null;
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

function createSlicedClient(): NumericSeriesCapability {
  return createClient({
    readNumericSeriesSlice: vi.fn(async (request) =>
      sliceResult(request, { stopReason: "source-exhausted" }),
    ),
  });
}

function sliceRequestOf(
  client: NumericSeriesCapability,
  call: number,
): NumericSeriesSliceRequest {
  const read = client.readNumericSeriesSlice;
  if (!read) {
    throw new Error("Client has no sliced numeric reader");
  }
  return vi.mocked(read).mock.calls[call][0];
}

function sliceResult(
  request: NumericSeriesSliceRequest,
  options: {
    readonly continuation?: ReadContinuation;
    readonly coverage?: readonly {
      readonly endNs: bigint;
      readonly startNs: bigint;
    }[];
    readonly resumeAtNs?: bigint;
    readonly stopReason: NumericSeriesSliceResult["stopReason"];
    readonly unavailable?: readonly {
      readonly endNs: bigint;
      readonly startNs: bigint;
    }[];
    readonly usage?: ReadWorkUsage;
  },
): NumericSeriesSliceResult {
  const coverage = options.coverage ?? [request.window];
  return {
    ...(options.continuation ? { continuation: options.continuation } : {}),
    ...(options.continuation
      ? {
          resumeAtNs:
            options.resumeAtNs ??
            [...coverage, ...(options.unavailable ?? [])].reduce(
              (endNs, range) => (range.endNs > endNs ? range.endNs : endNs),
              request.window.startNs - 1n,
            ) + 1n,
        }
      : {}),
    coverageByStream: new Map(
      request.selections.map((selection) => [selection.stream, coverage]),
    ),
    unavailableByStream: new Map(
      request.selections.map((selection) => [
        selection.stream,
        options.unavailable ?? [],
      ]),
    ),
    series: request.selections.map((selection) =>
      seriesResult(selection.stream, selection.fields),
    ),
    stopReason: options.stopReason,
    usage: options.usage ?? emptyReadUsage(),
  };
}

function emptyReadUsage(overrides: Partial<ReadWorkUsage> = {}): ReadWorkUsage {
  return {
    chunksOpened: 1,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 1,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded: 1,
    transferredBytes: 0,
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
  current: NumericSeriesContextValue | null;
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
