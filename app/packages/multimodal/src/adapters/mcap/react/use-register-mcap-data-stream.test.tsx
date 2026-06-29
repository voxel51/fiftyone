import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getPlayhead,
  getStreamValue,
  PlaybackProvider,
  setIsBuffering,
  usePlayback,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMcapTopicStatus } from "./mcap-stream-status-state";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import {
  McapDataStreamProvider,
  useMcapDataStream,
} from "./mcap-data-stream-context";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";

const TOPIC = "/CAM_FRONT/image_rect_compressed";

afterEach(() => {
  cleanup();
});

describe("useRegisterMcapDataStream", () => {
  it("ignores in-flight batch results after the source changes", async () => {
    const sourceA = createSource("source-a");
    const sourceB = createSource("source-b");
    const sourceBTimeline = deferred<McapTimelineRange>();
    const oldBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let batchReadCount = 0;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(() => {
        batchReadCount += 1;
        return batchReadCount === 1 ? oldBatch.promise : Promise.resolve([]);
      }),
      readTimelineRange: vi.fn((request) =>
        request.source.sourceId === sourceB.sourceId
          ? sourceBTimeline.promise
          : Promise.resolve(createTimelineRange()),
      ),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={sourceA}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={sourceB}
      />,
    );
    await waitFor(() => {
      expect(client.readTimelineRange).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      oldBatch.resolve([
        createWindow({
          timeNs: 0n,
          visualization: {
            bytes: new Uint8Array([1, 2, 3]),
            kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          },
        }),
      ]);
      await Promise.resolve();
    });

    await act(async () => {
      sourceBTimeline.resolve(createTimelineRange());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        vi.mocked(client.readSynchronizedMessageBatch).mock.calls.length,
      ).toBeGreaterThan(1);
    });
    expect(getStreamValue(store, TOPIC)).toBeNull();
  });

  it("ignores in-flight batch results after topic unsubscribe", async () => {
    const source = createSource("source");
    const oldBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(() => oldBatch.promise),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
        subscribe={false}
      />,
    );

    await act(async () => {
      oldBatch.resolve([
        createWindow({
          timeNs: 0n,
          visualization: {
            bytes: new Uint8Array([1, 2, 3]),
            kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          },
        }),
      ]);
      await Promise.resolve();
    });

    expect(getStreamValue(store, TOPIC)).toBeNull();
  });
});

describe("stream status + buffering feedback", () => {
  it("reports 'loading' while the current frame is in flight, then 'ready' when it lands", async () => {
    const source = createSource("source");
    const current = deferred<McapSynchronizedMessageWindow>();
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(() => current.promise),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("loading");
      expect(getBufferingDetail(store)).toBe("0/1 streams");
    });

    await act(async () => {
      current.resolve(
        createWindow({
          timeNs: 0n,
          visualization: {
            bytes: new Uint8Array([1, 2, 3]),
            kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("ready");
      expect(getBufferingDetail(store)).toBeNull();
      expect(getStreamValue(store, TOPIC)).not.toBeNull();
    });

    // The buffered-ranges strip is fed on a trailing throttle.
    await waitFor(
      () => {
        const ranges = getBufferedRanges(store);
        expect(ranges.length).toBeGreaterThan(0);
        expect(ranges[0][0]).toBe(0);
        expect(ranges[0][1]).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });

  it("reports 'gap' when the fetched tick has no message for the topic", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(async (request) =>
        createEmptyWindow(request.timeNs),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("gap");
    });
    // No message was ever resolved, so no frame is published either.
    expect(getStreamValue(store, TOPIC)).toBeNull();
  });

  it("marks the topic 'failed' after repeated fetch failures and stops stalling on those ticks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const source = createSource("source");
      const storeCapture = capturePlaybackStore();
      let api: ReturnType<typeof usePlayback> | undefined;
      const client = createClient({
        readSynchronizedMessageBatch: vi.fn(() =>
          Promise.reject(new Error("decode failed")),
        ),
        readSynchronizedMessages: vi.fn(() =>
          Promise.reject(new Error("decode failed")),
        ),
        readTimelineRange: vi.fn(async () => createTimelineRange()),
      });

      render(
        <Harness
          client={client}
          onStore={storeCapture.onStore}
          onApi={(playback) => {
            api = playback;
          }}
          source={source}
        />,
        { wrapper: TestProviders },
      );
      const store = storeCapture.store();

      // Mount produces two failures (current-frame + batch); a seek retry
      // pushes the streak over the cap.
      await waitFor(() => {
        expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
      });
      await act(async () => {
        api?.seek(0);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(getMcapTopicStatus(store, TOPIC)).toBe("failed");
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("clears the engine's paused-seek buffering flag once the seeked tick is covered", async () => {
    const source = createSource("source");
    // Hold every priority current-frame request open, keyed by tick, so
    // the test controls when the seeked tick's data "arrives". Lookahead
    // batches never settle — coverage must come from the priority lane.
    const currentCalls: Array<{
      readonly timeNs: bigint;
      readonly handle: {
        readonly promise: Promise<McapSynchronizedMessageWindow>;
        readonly reject: (reason?: unknown) => void;
        readonly resolve: (value: McapSynchronizedMessageWindow) => void;
      };
    }> = [];
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly McapSynchronizedMessageWindow[]>(
            () => undefined,
          ),
      ),
      readSynchronizedMessages: vi.fn((request) => {
        const handle = deferred<McapSynchronizedMessageWindow>();
        currentCalls.push({ timeNs: request.timeNs, handle });
        return handle.promise;
      }),
      // 60s file so the seek target sits far beyond the mount lookahead.
      readTimelineRange: vi.fn(async () =>
        createTimelineRange(60_000_000_000n),
      ),
    });

    render(
      <Harness
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    // Mount issues a priority fetch for tick 0.
    await waitFor(() => {
      expect(currentCalls.length).toBeGreaterThan(0);
    });
    const mountCalls = currentCalls.length;

    // Paused seek into uncached data → the engine raises isBuffering.
    act(() => api?.seek(30));
    expect(getIsBuffering(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("loading");
    });

    // The (debounced) seek event issues a priority fetch for the seeked
    // tick; resolving it is the "workers caught up" moment.
    await waitFor(() => {
      expect(currentCalls.length).toBeGreaterThan(mountCalls);
    });
    const seeked = currentCalls[currentCalls.length - 1];
    await act(async () => {
      seeked.handle.resolve(
        createWindow({
          timeNs: seeked.timeNs,
          visualization: {
            bytes: new Uint8Array([9]),
            kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getIsBuffering(store)).toBe(false);
      expect(getMcapTopicStatus(store, TOPIC)).toBe("ready");
    });
  });

  it("clears stale buffering state when the source changes", async () => {
    const sourceA = createSource("source-a");
    const sourceB = createSource("source-b");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly McapSynchronizedMessageWindow[]>(
            () => undefined,
          ),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={sourceA}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();
    await waitFor(() => {
      expect(client.readTimelineRange).toHaveBeenCalledTimes(1);
    });

    act(() => {
      setIsBuffering(store, true);
    });
    expect(getIsBuffering(store)).toBe(true);

    rerender(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={sourceB}
      />,
    );

    await waitFor(() => {
      expect(client.readTimelineRange).toHaveBeenCalledTimes(2);
      expect(getIsBuffering(store)).toBe(false);
    });
  });

  it("auto-forwards the initial playhead to the first tick with indexed topic data", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly McapSynchronizedMessageWindow[]>(
            () => undefined,
          ),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<McapSynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async () => [
        {
          firstMessageTimeNs: 10_000_000n,
          lastMessageTimeNs: 1_000_000_000n,
          topic: TOPIC,
        },
      ]),
    });

    render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(getPlayhead(store)).toBeCloseTo(1 / 30, 6);
    });
    expect(client.readTopicTimeBounds).toHaveBeenCalledTimes(1);
  });
});

function Harness({
  client,
  onStore,
  onApi,
  source,
  subscribe = true,
}: {
  readonly client: McapResourceClient;
  readonly onStore: (store: PlaybackStore) => void;
  readonly onApi?: (api: ReturnType<typeof usePlayback>) => void;
  readonly source: ByteSourceDescriptor | null;
  readonly subscribe?: boolean;
}) {
  const dataStream = useMcapDataStream();
  const store = usePlaybackStore();
  const api = usePlayback();
  useRegisterMcapDataStream({
    allTopics: [TOPIC],
    client,
    source,
    streamPolicies: {},
  });

  useEffect(() => {
    onStore(store);
  }, [onStore, store]);

  useEffect(() => {
    onApi?.(api);
  }, [onApi, api]);

  useEffect(() => {
    if (!subscribe) return undefined;

    return dataStream?.subscribeToTopic(TOPIC);
  }, [dataStream, subscribe]);

  return null;
}

function TestProviders({ children }: { readonly children: ReactNode }) {
  return (
    <PlaybackProvider duration={1}>
      <McapDataStreamProvider>{children}</McapDataStreamProvider>
    </PlaybackProvider>
  );
}

/**
 * Captures the Harness's PlaybackStore. `render` flushes effects
 * synchronously, so `store()` is safe to call right after it returns —
 * it throws if the Harness somehow failed to mount.
 */
function capturePlaybackStore() {
  let captured: PlaybackStore | undefined;
  return {
    onStore: (store: PlaybackStore) => {
      captured = store;
    },
    store: (): PlaybackStore => {
      if (!captured) {
        throw new Error("PlaybackStore was not captured — Harness not mounted");
      }
      return captured;
    },
  };
}

function createClient({
  readSynchronizedMessageBatch,
  readTimelineRange,
  // The priority current-frame lane fires on mount/seek; default to a
  // never-settling promise so tests that only exercise the batch lane
  // aren't affected by it.
  readSynchronizedMessages = vi.fn(
    () => new Promise<McapSynchronizedMessageWindow>(() => undefined),
  ),
  readTopicTimeBounds = vi.fn(async () => []),
}: {
  readonly readSynchronizedMessageBatch: McapResourceClient["readSynchronizedMessageBatch"];
  readonly readTimelineRange: McapResourceClient["readTimelineRange"];
  readonly readSynchronizedMessages?: McapResourceClient["readSynchronizedMessages"];
  readonly readTopicTimeBounds?: McapResourceClient["readTopicTimeBounds"];
}): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readSynchronizedMessageBatch,
    readSynchronizedMessages,
    readTimelineRange,
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds,
  };
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return {
    sourceId,
    url: `memory://${sourceId}.mcap`,
  };
}

function createTimelineRange(endTimeNs = 1_000_000_000n): McapTimelineRange {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs,
    startTimeNs: 0n,
  };
}

function createWindow({
  timeNs,
  visualization,
}: {
  readonly timeNs: bigint;
  readonly visualization: McapDecodedMessage["decoded"]["output"]["visualization"];
}): McapSynchronizedMessageWindow {
  const message = createDecodedMessage({ timeNs, visualization });
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs: timeNs,
    messages: [message],
    messagesByTopic: {
      [TOPIC]: [message],
    },
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createEmptyWindow(timeNs: bigint): McapSynchronizedMessageWindow {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs: timeNs,
    messages: [],
    messagesByTopic: {},
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createDecodedMessage({
  timeNs,
  visualization,
}: {
  readonly timeNs: bigint;
  readonly visualization: McapDecodedMessage["decoded"]["output"]["visualization"];
}): McapDecodedMessage {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 1,
    decoded: {
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: {
        visualization,
      },
      payload: {
        encoding: "test",
        schema: "test",
        schemaEncoding: "test",
      },
    },
    logTimeNs: timeNs,
    publishTimeNs: timeNs,
    sequence: 1,
    timelineTimeNs: timeNs,
    topic: TOPIC,
  };
}

function deferred<T>() {
  let resolveDeferred: ((value: T) => void) | undefined;
  let rejectDeferred: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise;
    rejectDeferred = rejectPromise;
  });

  const deferredResolve = (value: T) => {
    resolveDeferred?.(value);
  };
  const deferredReject = (reason?: unknown) => {
    rejectDeferred?.(reason);
  };

  return { promise, reject: deferredReject, resolve: deferredResolve };
}
