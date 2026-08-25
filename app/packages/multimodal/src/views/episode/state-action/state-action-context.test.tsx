import { playheadAtom, PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex, type DataStream } from "../../../runtime";
import { DataStreamProvider, useSetDataStream } from "../../../runtime/react";
import type {
  StateActionCapability,
  StateActionRow,
  StateActionSchema,
} from "../../../ports";
import {
  StateActionBridge,
  StateActionProvider,
  useStateActionContext,
  type StateActionContextValue,
} from "./state-action-context";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SCHEMA: StateActionSchema = {
  action: {
    dimensions: [{ index: 0 }, { index: 1 }],
    dtype: "float32",
    featureName: "action",
    shape: [2],
  },
  rowCount: 100,
  state: {
    dimensions: [{ index: 0, name: "shoulder" }, { index: 1 }],
    dtype: "float32",
    featureName: "observation.state",
    shape: [2],
  },
};

const NS_PER_SECOND = 1_000_000_000n;

/** Fake rows: one per whole second at t = 0s, 1s, 2s, … */
function rowAt(offset: number): StateActionRow {
  return {
    action: [offset, offset + 0.5],
    cursor: `row:${offset}`,
    frameIndex: offset,
    state: [offset * 10, offset * 10 + 1],
    task: { index: 0, label: "test task" },
    timestampNs: BigInt(offset) * NS_PER_SECOND,
  };
}

function createCapability(
  overrides: Partial<StateActionCapability> = {},
): StateActionCapability {
  return {
    readAtCursor: vi.fn(async ({ cursor }) =>
      rowAt(Number(cursor.slice("row:".length))),
    ),
    readAtTime: vi.fn(async ({ timestampNs }) =>
      timestampNs < 0n ? null : rowAt(Number(timestampNs / NS_PER_SECOND)),
    ),
    readIndexWindow: vi.fn(async (request) => {
      const selected =
        request.anchorCursor !== undefined
          ? Number(request.anchorCursor.slice("row:".length))
          : Number(request.anchorTimestampNs / NS_PER_SECOND);
      const start = Math.max(0, selected - request.before);
      const end = Math.min(100, selected + request.after + 1);
      return {
        entries: Array.from({ length: end - start }, (_, index) => ({
          cursor: `row:${start + index}`,
          timestampNs: BigInt(start + index) * NS_PER_SECOND,
        })),
        hasNext: end < 100,
        hasPrevious: start > 0,
        selectedCursor: `row:${selected}`,
      };
    }),
    schema: SCHEMA,
    ...overrides,
  };
}

describe("StateActionBridge", () => {
  it("publishes the schema at bridge start without any read", async () => {
    const capability = createCapability();
    const context = createContextRef();

    render(<Harness capability={capability} contextRef={context} />);
    await act(flushMicrotasks);

    expect(context.current?.schema).toEqual({
      schema: SCHEMA,
      status: "ready",
    });
    expect(capability.readAtTime).not.toHaveBeenCalled();
  });

  it("replays a schema request registered before the bridge mounts", async () => {
    const capability = createCapability();
    const context = createContextRef();
    const { rerender } = render(
      <Harness bridge={false} capability={capability} contextRef={context} />,
    );

    act(() => context.current?.ensureSchema());
    expect(context.current?.schema.status).toBe("idle");

    rerender(<Harness bridge capability={capability} contextRef={context} />);
    await act(flushMicrotasks);

    expect(context.current?.schema).toEqual({
      schema: SCHEMA,
      status: "ready",
    });
  });

  it("republishes the schema through ensureSchema after it is wiped", async () => {
    const capability = createCapability();
    const context = createContextRef();

    render(<Harness capability={capability} contextRef={context} />);
    await act(flushMicrotasks);
    expect(context.current?.schema.status).toBe("ready");

    // A shell remount's stale passive cleanup can reset the inventory after
    // the new epoch's layout-phase publish; the tile heals it by calling
    // ensureSchema from its own passive effect.
    await act(async () => {
      context.current?.ensureSchema();
      await flushMicrotasks();
    });
    expect(context.current?.schema).toEqual({
      schema: SCHEMA,
      status: "ready",
    });
  });

  it("resolves the subscribed row at the playhead with paused intent", async () => {
    const capability = createCapability();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 3);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });

    expect(capability.readAtTime).toHaveBeenCalledTimes(1);
    expect(capability.readAtTime).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "paused-inspection",
        timestampNs: 3n * NS_PER_SECOND,
      }),
    );
    expect(context.current?.rowState).toMatchObject({
      row: rowAt(3),
      status: "ready",
      targetNs: 3n * NS_PER_SECOND,
    });
  });

  it("follows playhead movement on the background intent", async () => {
    const capability = createCapability();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 3);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    await act(async () => {
      store.set(playheadAtom, 8);
      await flushMicrotasks();
    });

    expect(capability.readAtTime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        intent: "background",
        timestampNs: 8n * NS_PER_SECOND,
      }),
    );
    expect(context.current?.rowState?.row).toEqual(rowAt(8));
  });

  it("publishes only the newest target after rapid seeks", async () => {
    vi.useFakeTimers();
    const resolvers: ((row: StateActionRow | null) => void)[] = [];
    const requested: bigint[] = [];
    const capability = createCapability({
      readAtTime: vi.fn(async ({ timestampNs }) => {
        requested.push(timestampNs);
        return new Promise<StateActionRow | null>((resolve) => {
          resolvers.push(resolve);
        });
      }),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 1);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    expect(requested).toEqual([1n * NS_PER_SECOND]);

    // Two rapid seeks inside the throttle window coalesce to the newest.
    await act(async () => {
      store.set(playheadAtom, 5);
      store.set(playheadAtom, 9);
      await flushMicrotasks();
    });
    await act(async () => {
      resolvers[0](rowAt(1));
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      resolvers[1]?.(rowAt(9));
      await flushMicrotasks();
    });

    expect(requested).toEqual([1n * NS_PER_SECOND, 9n * NS_PER_SECOND]);
    expect(context.current?.rowState?.row).toEqual(rowAt(9));
  });

  it("keeps a cursor-pinned row through its own paused-seek echo", async () => {
    vi.useFakeTimers();
    const capability = createCapability();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 2);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    expect(capability.readAtTime).toHaveBeenCalledTimes(1);

    // Step to row 3: pin it and predict the echoed seek target.
    await act(async () => {
      context.current?.holdCursorRow(rowAt(3), 3n * NS_PER_SECOND);
      store.set(playheadAtom, 3);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(capability.readAtTime).toHaveBeenCalledTimes(1);
    expect(context.current?.rowState).toMatchObject({
      pinned: true,
      row: rowAt(3),
      status: "ready",
    });

    // A real user movement resumes ordinary time following.
    await act(async () => {
      store.set(playheadAtom, 7);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(capability.readAtTime).toHaveBeenCalledTimes(2);
    expect(context.current?.rowState).toMatchObject({
      row: rowAt(7),
      status: "ready",
    });
    expect(context.current?.rowState?.pinned).toBeUndefined();
  });

  it("publishes an empty resolution as a ready null row", async () => {
    const capability = createCapability({
      readAtTime: vi.fn(async () => null),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 0);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });

    expect(context.current?.rowState).toMatchObject({
      row: null,
      status: "ready",
    });
  });

  it("retains the previous row through a failed refetch and retries on demand", async () => {
    let failing = false;
    const capability = createCapability({
      readAtTime: vi.fn(async ({ timestampNs }) => {
        if (failing) throw new Error("link starved");
        return rowAt(Number(timestampNs / NS_PER_SECOND));
      }),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 2);

    render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    failing = true;
    await act(async () => {
      store.set(playheadAtom, 5);
      await flushMicrotasks();
    });

    expect(context.current?.rowState).toMatchObject({
      error: "link starved",
      row: rowAt(2),
      status: "error",
    });

    failing = false;
    await act(async () => {
      context.current?.retryRead();
      await flushMicrotasks();
    });
    expect(context.current?.rowState).toMatchObject({
      row: rowAt(5),
      status: "ready",
    });
  });

  it("clears the published row when the source changes", async () => {
    const capability = createCapability();
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 2);

    const { rerender } = render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    expect(context.current?.rowState?.row).toEqual(rowAt(2));

    const pending = createCapability({
      readAtTime: vi.fn(() => new Promise<never>(() => undefined)),
    });
    rerender(
      <Harness
        capability={pending}
        contextRef={context}
        sourceKey="other"
        store={store}
      />,
    );
    await act(flushMicrotasks);

    expect(context.current?.rowState?.row).toBeUndefined();
    expect(context.current?.rowState?.status).not.toBe("ready");
  });

  it("never publishes a late result after the bridge unmounts", async () => {
    let resolveRead!: (row: StateActionRow | null) => void;
    const capability = createCapability({
      readAtTime: vi.fn(
        () =>
          new Promise<StateActionRow | null>((resolve) => {
            resolveRead = resolve;
          }),
      ),
    });
    const context = createContextRef();
    const store = createStore();
    store.set(playheadAtom, 2);

    const { rerender } = render(
      <Harness capability={capability} contextRef={context} store={store} />,
    );
    await act(async () => {
      context.current?.subscribeRow();
      await flushMicrotasks();
    });
    rerender(
      <Harness
        bridge={false}
        capability={capability}
        contextRef={context}
        store={store}
      />,
    );
    await act(async () => {
      resolveRead(rowAt(2));
      await flushMicrotasks();
    });

    expect(context.current?.rowState).toBeUndefined();
  });

  it("forwards exact cursor and index reads with linked cancellation", async () => {
    const capability = createCapability();
    const context = createContextRef();

    render(<Harness capability={capability} contextRef={context} />);
    await act(flushMicrotasks);

    let row: StateActionRow | undefined;
    await act(async () => {
      row = await context.current?.readRowAtCursor("row:4");
      await context.current?.readRowIndexWindow({
        after: 1,
        anchorCursor: "row:4",
        before: 1,
      });
    });

    expect(row).toEqual(rowAt(4));
    expect(capability.readAtCursor).toHaveBeenCalledWith({
      cursor: "row:4",
      signal: expect.any(AbortSignal),
    });
    expect(capability.readIndexWindow).toHaveBeenCalledWith({
      after: 1,
      anchorCursor: "row:4",
      before: 1,
      signal: expect.any(AbortSignal),
    });
  });
});

function Harness({
  bridge = true,
  capability,
  contextRef,
  sourceKey = "test",
  store,
}: {
  readonly bridge?: boolean;
  readonly capability: StateActionCapability;
  readonly contextRef: { current: StateActionContextValue | null };
  readonly sourceKey?: string;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <StateActionProvider>
      <DataStreamProvider>
        <FakeDataStream />
        {bridge ? (
          <StateActionBridge capability={capability} sourceKey={sourceKey} />
        ) : null}
        <ContextProbe contextRef={contextRef} />
      </DataStreamProvider>
    </StateActionProvider>
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
  readonly contextRef: { current: StateActionContextValue | null };
}) {
  const value = useStateActionContext();
  // This effect forwards the latest context snapshot to the test body.
  useEffect(() => {
    contextRef.current = value;
  }, [contextRef, value]);
  return null;
}

function createContextRef(): {
  current: StateActionContextValue | null;
} {
  return { current: null };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
