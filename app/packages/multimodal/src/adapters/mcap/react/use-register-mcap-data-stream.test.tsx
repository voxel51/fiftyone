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
import { setMcapNetworkHealth } from "./mcap-network-health";
import { getMcapStartupCushionState } from "./mcap-startup-cushion-state";
import { getMcapTopicStatus } from "./mcap-stream-status-state";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
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
const IMAGE_ANNOTATION_TOPIC = "/CAM_FRONT/annotations";
const LIDAR_TOPIC = "/LIDAR_TOP";
const MAP_TOPIC = "/map";
const RADAR_TOPIC = "/RADAR_FRONT";
const DEFAULT_TEST_TOPICS = [TOPIC] as const;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("useRegisterMcapDataStream", () => {
  it("pauses and starts the next source at its first data tick", async () => {
    const sourceA = createSource("source-a");
    const sourceB = createSource("source-b");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const onApi = (value: ReturnType<typeof usePlayback>) => {
      api = value;
    };
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
      readTopicTimeBounds: vi.fn(async ({ source }) => [
        {
          firstMessageTimeNs:
            source.sourceId === sourceB.sourceId ? 10_000_000n : 0n,
          lastMessageTimeNs: 1_000_000_000n,
          topic: TOPIC,
        },
      ]),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onApi={onApi}
        onStore={storeCapture.onStore}
        source={sourceA}
        subscribe={false}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();
    await waitFor(() => {
      expect(client.readTimelineRange).toHaveBeenCalledTimes(1);
    });

    act(() => {
      api?.seek(0.75);
      api?.play();
    });
    expect(getPlayhead(store)).toBe(0.75);
    expect(getIsPlaying(store)).toBe(true);

    rerender(
      <Harness
        client={client}
        onApi={onApi}
        onStore={storeCapture.onStore}
        source={null}
        subscribe={false}
      />,
    );

    expect(getPlayhead(store)).toBe(0);
    expect(getIsPlaying(store)).toBe(false);

    rerender(
      <Harness
        client={client}
        onApi={onApi}
        onStore={storeCapture.onStore}
        source={sourceB}
      />,
    );

    await waitFor(() => {
      expect(getPlayhead(store)).toBeCloseTo(1 / 30, 6);
    });
    expect(getIsPlaying(store)).toBe(false);
    expect(client.readTopicTimeBounds).toHaveBeenCalledTimes(2);
  });

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

  it("queues blocking current-frame data before non-blocking map overlays", async () => {
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
        allTopics={[MAP_TOPIC, TOPIC]}
        blockingTopics={[TOPIC]}
        client={client}
        onStore={storeCapture.onStore}
        source={source}
        subscribedTopics={[MAP_TOPIC, TOPIC]}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessages).toHaveBeenCalledTimes(2);
    });
    const calls = vi.mocked(client.readSynchronizedMessages).mock.calls;
    expect(calls[0]?.[0].topics).toEqual([TOPIC]);
    expect(calls[1]?.[0].topics).toEqual([MAP_TOPIC]);
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

  it("starts playback without buffering when no playback topics are active", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <PlaybackProvider duration={0}>
        <McapDataStreamProvider>
          <Harness
            client={client}
            onApi={(value) => {
              api = value;
            }}
            onStore={storeCapture.onStore}
            source={source}
            subscribe={false}
          />
        </McapDataStreamProvider>
      </PlaybackProvider>,
    );
    const store = storeCapture.store();

    act(() => {
      api?.play();
    });
    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);

    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
      expect(getIsPlayPending(store)).toBe(false);
      expect(getIsBuffering(store)).toBe(false);
    });
    expect(client.readSynchronizedMessageBatch).not.toHaveBeenCalled();
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
          vi.mocked(client.readSynchronizedMessageBatch).mock.calls.length,
        ).toBeGreaterThan(1);
      },
      { timeout: 2000 },
    );

    const loopbackCall = vi
      .mocked(client.readSynchronizedMessageBatch)
      .mock.calls.slice(1)
      .find(([, options]) => options?.priority === "playback");
    expect(loopbackCall?.[1]?.priority).toBe("playback");
    expect(loopbackCall?.[0].timeNs.length).toBeGreaterThan(0);
    expect(loopbackCall?.[0].timeNs.at(-1)).toBeLessThanOrEqual(2_000_000_000n);
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

  it("keeps held annotation streams ready without stale-frame warning status", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(async (request) =>
        request.timeNs === 0n
          ? createWindow({
              timeNs: 0n,
              topic: IMAGE_ANNOTATION_TOPIC,
              visualization: {
                circles: [],
                kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
                points: [],
                texts: [],
              },
            })
          : createWindow({
              messageTimeNs: 0n,
              timeNs: request.timeNs,
              topic: IMAGE_ANNOTATION_TOPIC,
              visualization: {
                circles: [],
                kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
                points: [],
                texts: [],
              },
            }),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async () => [
        {
          firstMessageTimeNs: 0n,
          lastMessageTimeNs: 0n,
          topic: IMAGE_ANNOTATION_TOPIC,
        },
      ]),
    });

    render(
      <Harness
        allTopics={[IMAGE_ANNOTATION_TOPIC]}
        blockingTopics={[IMAGE_ANNOTATION_TOPIC]}
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
        staleMediaWarningNs={500_000_000n}
        staleWarningTopics={[]}
        subscribedTopics={[IMAGE_ANNOTATION_TOPIC]}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(getMcapTopicStatus(store, IMAGE_ANNOTATION_TOPIC)).toBe("ready");
    });

    await act(async () => {
      api?.seek(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      const value = getStreamValue(
        store,
        IMAGE_ANNOTATION_TOPIC,
      ) as McapTopicPlaybackFrame | null;
      expect(value).not.toBeNull();
      expect(value?.contentTimeNs).toBe(0n);
      expect(value?.requestedTimeNs).toBeGreaterThan(500_000_000n);
      expect(getMcapTopicStatus(store, IMAGE_ANNOTATION_TOPIC)).toBe("ready");
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

  it("increments failure state only for the topic whose payload decode failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const source = createSource("source");
      const storeCapture = capturePlaybackStore();
      let api: ReturnType<typeof usePlayback> | undefined;
      const client = createClient({
        readSynchronizedMessageBatch: vi.fn(async (request) =>
          request.timeNs.map(createPartialDecodeWindow),
        ),
        readSynchronizedMessages: vi.fn(async (request) =>
          createPartialDecodeWindow(request.timeNs),
        ),
        readTimelineRange: vi.fn(async () => createTimelineRange()),
      });

      render(
        <Harness
          allTopics={[TOPIC, LIDAR_TOPIC]}
          blockingTopics={[TOPIC, LIDAR_TOPIC]}
          client={client}
          onApi={(playback) => {
            api = playback;
          }}
          onStore={storeCapture.onStore}
          source={source}
          subscribedTopics={[TOPIC, LIDAR_TOPIC]}
        />,
        { wrapper: TestProviders },
      );
      const store = storeCapture.store();

      await waitFor(() => {
        expect(getMcapTopicStatus(store, LIDAR_TOPIC)).toBe("ready");
        expect(getStreamValue(store, LIDAR_TOPIC)).not.toBeNull();
      });
      await act(async () => {
        api?.seek(0.5);
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(getMcapTopicStatus(store, TOPIC)).toBe("failed");
      });
      expect(getMcapTopicStatus(store, LIDAR_TOPIC)).toBe("ready");
      expect(getStreamValue(store, LIDAR_TOPIC)).not.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("giving up on topics"),
        [TOPIC],
        expect.any(Error),
      );
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

  it("seeks and prefetches virtual ticks beyond the old materialized tick cap", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const currentFrameTicks: bigint[] = [];
    const batchTicks: bigint[] = [];
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async (request) => {
        batchTicks.push(...request.timeNs);
        return [];
      }),
      readSynchronizedMessages: vi.fn(async (request) => {
        currentFrameTicks.push(request.timeNs);
        return createEmptyWindow(request.timeNs);
      }),
      readTimelineRange: vi.fn(async () =>
        createTimelineRange(7_200_000_000_000n),
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

    await waitFor(() => {
      expect(currentFrameTicks.length).toBeGreaterThan(0);
    });

    act(() => api?.seek(3_600));

    await waitFor(() => {
      expect(currentFrameTicks.some((tick) => tick > 3_000_000_000_000n)).toBe(
        true,
      );
    });
    await waitFor(() => {
      expect(batchTicks.some((tick) => tick > 3_000_000_000_000n)).toBe(true);
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

describe("bandwidth-aware startup cushion + stall rendering", () => {
  const IMAGE_VISUALIZATION = {
    bytes: new Uint8Array([1, 2, 3]),
    kind: VISUALIZATION_KIND.ENCODED_IMAGE,
  } as const;

  it("retains the previous frame while an uncovered seek target loads", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      // Batches seed nothing: the only real frame arrives through the
      // current-frame lane at tick 0, so the held-value transitions stay
      // deterministic.
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn((request) =>
        request.timeNs === 0n
          ? Promise.resolve(
              createWindow({
                timeNs: 0n,
                visualization: IMAGE_VISUALIZATION,
              }),
            )
          : new Promise<McapSynchronizedMessageWindow>(() => undefined),
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
      expect(getStreamValue(store, TOPIC)).not.toBeNull();
    });
    const previousFrame = getStreamValue(store, TOPIC);

    act(() => {
      api?.seek(0.9);
    });

    // The debounced seek keeps the previous frame until foreground data for
    // the target arrives. Stream status makes that retained content explicit.
    await waitFor(() => {
      expect(getMcapTopicStatus(store, TOPIC)).toBe("loading");
    });
    expect(getStreamValue(store, TOPIC)).toBe(previousFrame);
  });

  it("gates a pending play press behind the bandwidth cushion and reports progress", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const cushionFill = deferred<void>();
    const client = createClient({
      // The static startup floor fills immediately; fills past it (the
      // bandwidth cushion) are held until the test releases them.
      readSynchronizedMessageBatch: vi.fn(async (request) => {
        const windows = request.timeNs.map((tick: bigint) =>
          createWindow({ timeNs: tick, visualization: IMAGE_VISUALIZATION }),
        );
        if ((request.timeNs[0] ?? 0n) > 500_000_000n) {
          await cushionFill.promise;
        }
        return windows;
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          timeNs: request.timeNs,
          visualization: IMAGE_VISUALIZATION,
        }),
      ),
      readTimelineRange: vi.fn(async () => ({
        ...createTimelineRange(),
        // 100 bytes over one second, uniform.
        byteTimeline: [
          {
            cumulativeCompressedBytes: 50,
            endTimeNs: 500_000_000n,
            startOffsetBytes: 0n,
          },
          {
            cumulativeCompressedBytes: 100,
            endTimeNs: 1_000_000_000n,
            startOffsetBytes: 50n,
          },
        ],
      })),
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
      expect(getBufferedRanges(store).length).toBeGreaterThan(0);
    });

    // A measured link at ~40% of the content bitrate: the full-smoothness
    // cushion is the entire remaining second, well past the 0.5s floor.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 1,
        busyThroughputBytesPerSec: null,
        limited: true,
        throughputBytesPerSec: 40 / 0.85,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
    });
    act(() => {
      api?.play();
    });

    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)?.targetSeconds).toBe(1);
    });

    // Releasing the cushion fill opens the gate.
    await act(async () => {
      cushionFill.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
      expect(getIsPlayPending(store)).toBe(false);
    });
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)).toBeNull();
    });
  });

  it("starts at the static floor when the recording has no byte curve", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async (request) =>
        request.timeNs.map((tick: bigint) =>
          createWindow({ timeNs: tick, visualization: IMAGE_VISUALIZATION }),
        ),
      ),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          timeNs: request.timeNs,
          visualization: IMAGE_VISUALIZATION,
        }),
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
      expect(getBufferedRanges(store).length).toBeGreaterThan(0);
    });

    // The same constrained link, but no byte curve to size a cushion
    // from: the gate stays at the static floor and play starts as soon
    // as it is covered.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 1,
        busyThroughputBytesPerSec: null,
        limited: true,
        throughputBytesPerSec: 40 / 0.85,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
    });
    act(() => {
      api?.play();
    });

    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
    });
    expect(getMcapStartupCushionState(store)).toBeNull();
  });

  it("starts provisionally from banked remote runway and resets the one-shot decision", async () => {
    const source = createSource("source", BYTE_SOURCE_READ_PROFILE.REMOTE);
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const uncoveredFill = deferred<void>();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async (request) => {
        const windows = request.timeNs.map((tick: bigint) =>
          createWindow({ timeNs: tick, visualization: IMAGE_VISUALIZATION }),
        );
        const firstSec = Number(request.timeNs[0] ?? 0n) / 1_000_000_000;
        if (firstSec > 1.5) {
          await uncoveredFill.promise;
        }
        return windows;
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          timeNs: request.timeNs,
          visualization: IMAGE_VISUALIZATION,
        }),
      ),
      readTimelineRange: vi.fn(async () => ({
        ...createTimelineRange(8_000_000_000n),
        byteTimeline: Array.from({ length: 8 }, (_, i) => ({
          cumulativeCompressedBytes: (i + 1) * 100,
          endTimeNs: BigInt(i + 1) * 1_000_000_000n,
          startOffsetBytes: BigInt(i) * 100n,
        })),
      })),
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

    await waitFor(
      () => {
        const range = getBufferedRanges(store)[0];
        expect(range?.[0]).toBe(0);
        expect(range?.[1] ?? 0).toBeGreaterThanOrEqual(1.5);
      },
      { timeout: 3000 },
    );

    // The link is still unmeasured, but the user already has real blocking
    // runway banked. Start at the floor instead of refusing to spend it.
    act(() => {
      api?.play();
    });
    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
      expect(getIsPlayPending(store)).toBe(false);
    });
    expect(getMcapStartupCushionState(store)).toBeNull();

    act(() => {
      api?.pause();
      api?.seek(1.7);
      api?.play();
    });

    // The previous provisional decision was one-shot. A later uncovered
    // remote press still holds at the unmeasured-link ceiling while its
    // pending prefetch is in flight.
    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)?.targetSeconds).toBe(6);
    });
  });

  it("does not release a held press when a burst re-reads the link as fast", async () => {
    const source = createSource("source", BYTE_SOURCE_READ_PROFILE.REMOTE);
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const gatedFills: Array<() => void> = [];
    const client = createClient({
      // The static floor fills immediately; cushion fills park until the
      // test releases them one at a time to drive status publishes.
      readSynchronizedMessageBatch: vi.fn(async (request) => {
        const windows = request.timeNs.map((tick: bigint) =>
          createWindow({ timeNs: tick, visualization: IMAGE_VISUALIZATION }),
        );
        if ((request.timeNs[0] ?? 0n) > 500_000_000n) {
          await new Promise<void>((resolve) => {
            gatedFills.push(resolve);
          });
        }
        return windows;
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          timeNs: request.timeNs,
          visualization: IMAGE_VISUALIZATION,
        }),
      ),
      readTimelineRange: vi.fn(async () => ({
        ...createTimelineRange(8_000_000_000n),
        // Uniform 100 bytes per content second across 8 seconds.
        byteTimeline: Array.from({ length: 8 }, (_, i) => ({
          cumulativeCompressedBytes: (i + 1) * 100,
          endTimeNs: BigInt(i + 1) * 1_000_000_000n,
          startOffsetBytes: BigInt(i) * 100n,
        })),
      })),
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
      expect(getBufferedRanges(store).length).toBeGreaterThan(0);
    });

    // A measured link at ~half the content bitrate: the plan wants a 4s
    // cushion (400 bytes banked covers the worst 8s deficit).
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 1,
        busyThroughputBytesPerSec: 60 / 0.85,
        limited: true,
        throughputBytesPerSec: 60 / 0.85,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
    });
    act(() => {
      api?.play();
    });

    expect(getIsPlayPending(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)?.targetSeconds).toBe(4);
    });

    // Mid-hold the rolling window turns over and briefly reads the link
    // as effectively infinite. The pending session's pessimistic envelope
    // must keep the 4s requirement instead of collapsing to the floor
    // and starting into the known deficit.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 0.2,
        busyThroughputBytesPerSec: 1_000_000_000,
        limited: false,
        throughputBytesPerSec: 1_000_000_000,
        throughputPlannable: true,
        updatedAtMs: 2,
      });
    });
    await act(async () => {
      gatedFills.shift()?.();
      await Promise.resolve();
    });

    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)?.targetSeconds).toBe(4);
    });
  });

  it("holds a remote press at the ceiling until throughput is planning-grade", async () => {
    const source = createSource("source", BYTE_SOURCE_READ_PROFILE.REMOTE);
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const gateFill = deferred<void>();
    const client = createClient({
      // The static floor fills immediately; everything past it (the held
      // press's pending prefetch) stays in flight until released.
      readSynchronizedMessageBatch: vi.fn(async (request) => {
        const windows = request.timeNs.map((tick: bigint) =>
          createWindow({ timeNs: tick, visualization: IMAGE_VISUALIZATION }),
        );
        if ((request.timeNs[0] ?? 0n) > 500_000_000n) {
          await gateFill.promise;
        }
        return windows;
      }),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          timeNs: request.timeNs,
          visualization: IMAGE_VISUALIZATION,
        }),
      ),
      readTimelineRange: vi.fn(async () => ({
        ...createTimelineRange(8_000_000_000n),
        byteTimeline: [
          {
            cumulativeCompressedBytes: 400,
            endTimeNs: 4_000_000_000n,
            startOffsetBytes: 0n,
          },
          {
            cumulativeCompressedBytes: 800,
            endTimeNs: 8_000_000_000n,
            startOffsetBytes: 400n,
          },
        ],
      })),
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
      expect(getBufferedRanges(store).length).toBeGreaterThan(0);
    });

    // No transport samples yet: with nothing planning-grade measured, a
    // remote press must hold at the cushion ceiling instead of collapsing
    // to the floor and starting into an unknown link.
    act(() => {
      api?.play();
    });

    expect(getIsPlaying(store)).toBe(false);
    expect(getIsPlayPending(store)).toBe(true);
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)?.targetSeconds).toBe(6);
    });
    expect(getIsPlaying(store)).toBe(false);

    // The pending prefetch produced real samples; the link measures far
    // above the content bitrate, so the plan re-resolves to the floor and
    // the already-covered window releases the press.
    act(() => {
      setMcapNetworkHealth(store, {
        busyFraction: 0.2,
        busyThroughputBytesPerSec: null,
        limited: false,
        throughputBytesPerSec: 1_000_000_000,
        throughputPlannable: true,
        updatedAtMs: 1,
      });
    });
    await act(async () => {
      gateFill.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getIsPlaying(store)).toBe(true);
      expect(getIsPlayPending(store)).toBe(false);
    });
    await waitFor(() => {
      expect(getMcapStartupCushionState(store)).toBeNull();
    });
  });
});

function Harness({
  allTopics = DEFAULT_TEST_TOPICS,
  blockingTopics = DEFAULT_TEST_TOPICS,
  client,
  onStore,
  onApi,
  source,
  staleMediaWarningNs = 0n,
  staleWarningTopics = DEFAULT_TEST_TOPICS,
  subscribe = true,
  subscribedTopics = DEFAULT_TEST_TOPICS,
  streamPolicies = {},
}: {
  readonly allTopics?: readonly string[];
  readonly blockingTopics?: readonly string[];
  readonly client: McapResourceClient;
  readonly onStore: (store: PlaybackStore) => void;
  readonly onApi?: (api: ReturnType<typeof usePlayback>) => void;
  readonly source: ByteSourceDescriptor | null;
  readonly staleMediaWarningNs?: bigint;
  readonly staleWarningTopics?: readonly string[];
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
    source,
    staleMediaWarningNs,
    staleWarningTopics,
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
    enumerateNumericFields: vi.fn(async () => []),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 0n,
      fields: [],
      messageCount: 0,
      topic: "",
      truncated: false,
    })),
    readRawMessageRecord: vi.fn(),
  };
}

function createSource(
  sourceId: string,
  readProfile?: ByteSourceDescriptor["readProfile"],
): ByteSourceDescriptor {
  return {
    readProfile,
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
  topic = TOPIC,
  visualization,
}: {
  readonly messageTimeNs?: bigint;
  readonly timeNs: bigint;
  readonly topic?: string;
  readonly visualization: McapDecodedMessage["decoded"]["output"]["visualization"];
}): McapSynchronizedMessageWindow {
  const message = createDecodedMessage({
    timeNs: messageTimeNs ?? timeNs,
    topic,
    visualization,
  });
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs: timeNs,
    messages: [message],
    messagesByTopic: {
      [topic]: [message],
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

function createPartialDecodeWindow(
  timeNs: bigint,
): McapSynchronizedMessageWindow {
  const lidarMessage = createDecodedMessage({
    timeNs,
    topic: LIDAR_TOPIC,
    visualization: {
      bytes: new Uint8Array([1]),
      kind: VISUALIZATION_KIND.ENCODED_IMAGE,
    },
  });
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    decodeErrorsByTopic: {
      [TOPIC]: [
        {
          code: "message-decode-failed",
          message: "invalid calibration",
          messageTimeNs: timeNs,
          payloadIdentity: '["cdr","ros2msg","sensor_msgs/msg/CameraInfo"]',
          requestedTimeNs: timeNs,
          topic: TOPIC,
        },
      ],
    },
    endTimeNs: timeNs,
    messages: [lidarMessage],
    messagesByTopic: {
      [LIDAR_TOPIC]: [lidarMessage],
      [TOPIC]: [],
    },
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createDecodedMessage({
  timeNs,
  topic = TOPIC,
  visualization,
}: {
  readonly timeNs: bigint;
  readonly topic?: string;
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
    topic,
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
