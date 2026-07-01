import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getIsPlayPending,
  getIsPlaying,
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
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import {
  McapDataStreamProvider,
  useMcapDataStream,
} from "./mcap-data-stream-context";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";
import { useRegisterMcapDataStream } from "./use-register-mcap-data-stream";

const TOPIC = "/CAM_FRONT/image_rect_compressed";
const LIDAR_TOPIC = "/LIDAR_TOP";
const RADAR_TOPIC = "/RADAR_FRONT";
const DEFAULT_TEST_TOPICS = [TOPIC] as const;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  for (const attr of [
    "data-mcap-latency-bandwidth",
    "data-mcap-latency-events",
    "data-mcap-latency-metrics",
    "data-mcap-worker-attribution",
  ]) {
    document.documentElement.removeAttribute(attr);
  }
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
  it("starts with a small adaptive startup batch instead of the full background lookahead", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
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

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    const request = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls[0]?.[0];
    const options = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls[0]?.[1];
    expect(request?.timeNs.length).toBeGreaterThan(0);
    expect(request?.timeNs.length).toBeLessThanOrEqual(15);
    expect(request?.timeNs.at(-1)).toBeLessThanOrEqual(500_000_000n);
    expect(options?.priority).toBe("playback");
  });

  it("starts multi-topic playback across all active panes with a bounded startup window", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(
        () => new Promise<McapSynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        allTopics={[LIDAR_TOPIC, RADAR_TOPIC, TOPIC]}
        blockingTopics={[LIDAR_TOPIC, RADAR_TOPIC, TOPIC]}
        client={client}
        onStore={storeCapture.onStore}
        pointCloudTopics={[LIDAR_TOPIC, RADAR_TOPIC]}
        source={source}
        subscribedTopics={[LIDAR_TOPIC, RADAR_TOPIC, TOPIC]}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    const firstBatch = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls[0];
    expect(firstBatch?.[0].topics).toEqual([LIDAR_TOPIC, RADAR_TOPIC, TOPIC]);
    expect(firstBatch?.[0].timeNs.length).toBeLessThanOrEqual(15);
    expect(firstBatch?.[1]?.priority).toBe("playback");

    await waitFor(() => {
      expect(client.readSynchronizedMessages).toHaveBeenCalled();
    });
    const firstCurrentFrame = vi.mocked(client.readSynchronizedMessages).mock
      .calls[0]?.[0];
    expect(firstCurrentFrame?.topics).toEqual([
      LIDAR_TOPIC,
      RADAR_TOPIC,
      TOPIC,
    ]);
  });

  it("bridges debug batch ids into latency events and bandwidth samples", async () => {
    window.history.replaceState(null, "", "/?mcapLatencyDebug=1");
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
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

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    const request = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls[0]?.[0];
    expect(request?.mcapDataRequestId).toMatch(/^mcap-data:startup-lookahead:/);

    await waitFor(() => {
      const events = readDebugAttribute<
        Array<{ detail?: Record<string, unknown>; name: string }>
      >("data-mcap-latency-events");
      expect(
        events.some(
          (event) =>
            event.name === "mcap data batch request" &&
            event.detail?.mcapDataRequestId === request?.mcapDataRequestId,
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      const bandwidth = readDebugAttribute<{
        recent: Array<{ requestId?: string }>;
      }>("data-mcap-latency-bandwidth");
      expect(
        bandwidth.recent.some(
          (sample) => sample.requestId === request?.mcapDataRequestId,
        ),
      ).toBe(true);
    });
  });

  it("does not queue idle background lookahead while startup data is still in flight", async () => {
    const source = createSource("source");
    const startupBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(() => startupBatch.promise),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
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

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    act(() => {
      api?.seek(0.2);
    });
    await Promise.resolve();

    const calls = vi.mocked(client.readSynchronizedMessageBatch).mock.calls;
    expect(calls.some(([, options]) => options?.priority === "idle")).toBe(
      false,
    );
    expect(calls.every(([, options]) => options?.priority === "playback")).toBe(
      true,
    );
  });

  it("starts pending play as soon as the startup window is covered", async () => {
    const source = createSource("source");
    const startupBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    let startupRequest:
      | Parameters<McapResourceClient["readSynchronizedMessageBatch"]>[0]
      | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn((request) => {
        startupRequest ??= request;
        return startupBatch.promise;
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createEmptyWindow(request.timeNs),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
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

    await waitFor(() => {
      expect(startupRequest).toBeDefined();
    });
    const resolvedStartupRequest = startupRequest;
    if (!resolvedStartupRequest) {
      throw new Error("Startup request was not captured");
    }

    act(() => {
      api?.play();
    });
    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);

    await act(async () => {
      startupBatch.resolve(
        resolvedStartupRequest.timeNs.map(createEmptyWindow),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
      expect(getIsPlayPending(store)).toBe(false);
    });
  });

  it("warms paused lookahead after the startup window is covered", async () => {
    const source = createSource("source");
    const startupBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let startupRequest:
      | Parameters<McapResourceClient["readSynchronizedMessageBatch"]>[0]
      | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn((request) => {
        startupRequest ??= request;
        return startupRequest === request
          ? startupBatch.promise
          : Promise.resolve(request.timeNs.map(createEmptyWindow));
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createEmptyWindow(request.timeNs),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange(5_000_000_000n)),
    });

    render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(startupRequest).toBeDefined();
    });
    const resolvedStartupRequest = startupRequest;
    if (!resolvedStartupRequest) {
      throw new Error("Startup request was not captured");
    }

    await act(async () => {
      startupBatch.resolve(
        resolvedStartupRequest.timeNs.map(createEmptyWindow),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        vi
          .mocked(client.readSynchronizedMessageBatch)
          .mock.calls.some(([, options]) => options?.priority === "idle"),
      ).toBe(true);
    });

    const idleCall = vi
      .mocked(client.readSynchronizedMessageBatch)
      .mock.calls.find(([, options]) => options?.priority === "idle");
    expect(idleCall?.[0].timeNs.length).toBeGreaterThan(0);
    expect(idleCall?.[0].timeNs.length).toBeLessThanOrEqual(30);
    expect(idleCall?.[0].timeNs.at(-1)).toBeLessThanOrEqual(1_500_000_000n);
    expect(idleCall?.[0].topics).toEqual([TOPIC]);
  });

  it("warms a loop-start runway when the loop end is inside lookahead", async () => {
    window.history.replaceState(null, "", "/?mcapLatencyDebug=1");
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async (request) =>
        request.timeNs.map(createEmptyWindow),
      ),
      readSynchronizedMessages: vi.fn(async (request) =>
        createEmptyWindow(request.timeNs),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange(2_000_000_000n)),
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

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    act(() => {
      api?.seek(1.75);
    });

    await waitFor(
      () => {
        expect(
          vi
            .mocked(client.readSynchronizedMessageBatch)
            .mock.calls.some(([request]) =>
              request.mcapDataRequestId?.includes("loopback-lookahead"),
            ),
        ).toBe(true);
      },
      { timeout: 2000 },
    );

    const loopbackCall = vi
      .mocked(client.readSynchronizedMessageBatch)
      .mock.calls.find(([request]) =>
        request.mcapDataRequestId?.includes("loopback-lookahead"),
      );
    expect(loopbackCall?.[1]?.priority).toBe("playback");
    expect(loopbackCall?.[0].timeNs.length).toBeGreaterThan(0);
    expect(loopbackCall?.[0].timeNs.at(-1)).toBeLessThanOrEqual(2_000_000_000n);

    await waitFor(() => {
      const events = readDebugAttribute<Array<{ name: string }>>(
        "data-mcap-latency-events",
      );
      expect(
        events.some((event) => event.name === "loopback runway request"),
      ).toBe(true);
    });
  });

  it("queues covered background lookahead as small idle batches", async () => {
    const source = createSource("source");
    const batches: Array<{
      readonly request: Parameters<
        McapResourceClient["readSynchronizedMessageBatch"]
      >[0];
      readonly resolve: (
        windows: readonly McapSynchronizedMessageWindow[],
      ) => void;
      readonly promise: Promise<readonly McapSynchronizedMessageWindow[]>;
    }> = [];
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn((request) => {
        const batch = deferred<readonly McapSynchronizedMessageWindow[]>();
        batches.push({
          promise: batch.promise,
          request,
          resolve: batch.resolve,
        });
        return batch.promise;
      }),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
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

    await waitFor(() => {
      expect(batches.length).toBeGreaterThan(0);
    });
    const startupRequest = batches[0].request;

    await act(async () => {
      batches[0].resolve([
        createEmptyWindow(0n),
        ...startupRequest.timeNs.map(createEmptyWindow),
      ]);
      await Promise.resolve();
    });

    act(() => {
      api?.seek(0.001);
    });

    await waitFor(() => {
      expect(
        vi
          .mocked(client.readSynchronizedMessageBatch)
          .mock.calls.some(([, options]) => options?.priority === "idle"),
      ).toBe(true);
    });

    const idleCall = vi
      .mocked(client.readSynchronizedMessageBatch)
      .mock.calls.find(([, options]) => options?.priority === "idle");
    expect(idleCall?.[0].timeNs.length).toBeGreaterThan(0);
    expect(idleCall?.[0].timeNs.length).toBeLessThanOrEqual(30);
  });

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

  it("keeps displaying old media and marks it stale past the warning threshold", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(async (request) =>
        request.timeNs === 0n
          ? createWindow({
              timeNs: 0n,
              visualization: {
                bytes: new Uint8Array([1]),
                kind: VISUALIZATION_KIND.ENCODED_IMAGE,
              },
            })
          : createWindow({
              messageTimeNs: 0n,
              timeNs: request.timeNs,
              visualization: {
                bytes: new Uint8Array([1]),
                kind: VISUALIZATION_KIND.ENCODED_IMAGE,
              },
            }),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async () => [
        {
          firstMessageTimeNs: 0n,
          lastMessageTimeNs: 0n,
          topic: TOPIC,
        },
      ]),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
        staleMediaWarningNs={500_000_000n}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      const value = getStreamValue(
        store,
        TOPIC,
      ) as McapTopicPlaybackFrame | null;
      expect(value?.contentTimeNs).toBe(0n);
      expect(getMcapTopicStatus(store, TOPIC)).toBe("ready");
    });

    await act(async () => {
      api?.seek(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      const value = getStreamValue(
        store,
        TOPIC,
      ) as McapTopicPlaybackFrame | null;
      expect(value).not.toBeNull();
      expect(value?.contentTimeNs).toBe(0n);
      expect(value?.requestedTimeNs).toBeGreaterThan(500_000_000n);
      expect(value?.ageNs).toBe(value?.requestedTimeNs);
      expect(getMcapTopicStatus(store, TOPIC)).toBe("stale");
    });

    rerender(
      <Harness
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
        staleMediaWarningNs={0n}
      />,
    );

    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("ready");
    });
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
  allTopics = DEFAULT_TEST_TOPICS,
  blockingTopics = DEFAULT_TEST_TOPICS,
  client,
  onStore,
  onApi,
  pointCloudTopics = [],
  source,
  staleMediaWarningNs = 0n,
  subscribe = true,
  subscribedTopics = DEFAULT_TEST_TOPICS,
  streamPolicies = {},
}: {
  readonly allTopics?: readonly string[];
  readonly blockingTopics?: readonly string[];
  readonly client: McapResourceClient;
  readonly onStore: (store: PlaybackStore) => void;
  readonly onApi?: (api: ReturnType<typeof usePlayback>) => void;
  readonly pointCloudTopics?: readonly string[];
  readonly source: ByteSourceDescriptor | null;
  readonly staleMediaWarningNs?: bigint;
  readonly subscribe?: boolean;
  readonly subscribedTopics?: readonly string[];
  readonly streamPolicies?: McapStreamSyncPolicies;
}) {
  const dataStream = useMcapDataStream();
  const store = usePlaybackStore();
  const api = usePlayback();
  useRegisterMcapDataStream({
    allTopics,
    blockingTopics,
    client,
    pointCloudTopics,
    source,
    staleMediaWarningNs,
    streamPolicies,
  });

  useEffect(() => {
    onStore(store);
  }, [onStore, store]);

  useEffect(() => {
    onApi?.(api);
  }, [onApi, api]);

  useEffect(() => {
    if (!subscribe) return undefined;

    const cleanups = subscribedTopics.map((topic) =>
      dataStream?.subscribeToTopic(topic),
    );
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
  }, [dataStream, subscribe, subscribedTopics]);

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

function readDebugAttribute<T>(name: string): T {
  const value = document.documentElement.getAttribute(name);
  if (!value) throw new Error(`Missing debug attribute: ${name}`);
  return JSON.parse(value) as T;
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
  messageTimeNs,
  timeNs,
  visualization,
}: {
  readonly messageTimeNs?: bigint;
  readonly timeNs: bigint;
  readonly visualization: McapDecodedMessage["decoded"]["output"]["visualization"];
}): McapSynchronizedMessageWindow {
  const message = createDecodedMessage({
    timeNs: messageTimeNs ?? timeNs,
    visualization,
  });
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
