import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getIsPlayPending,
  getIsPlaying,
  getPlayhead,
  getSeekFetchDebounceMs,
  getStreamValue,
  PlaybackProvider,
  setIsBuffering,
  usePlayback,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setNetworkHealth } from "./network-health";
import * as decodedCachePolicy from "./decoded-cache-policy";
import { getStartupCushionState } from "./startup-cushion-state";
import { getStreamStatus } from "./stream-status-state";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import type {
  ByteTimelinePoint,
  DecodedFrame,
  StreamSyncPolicies,
  SynchronizedFrameWindow,
} from "../../../ir";
import { EpisodeReadCancelledError, type EpisodeSession } from "../../../ports";
import type { DecodeResult } from "../../../query/decoding";
import {
  DataStreamProvider,
  useDataStream,
  type DataStream,
} from "./data-stream-context";
import type { StreamPlaybackFrame } from "./use-stream-values";
import {
  cancelIdleReads,
  cancelRunwayReads,
  useRegisterDataStream,
} from "./use-register-data-stream";

const STREAM = "/CAM_FRONT/image_rect_compressed";
const IMAGE_ANNOTATION_STREAM = "/CAM_FRONT/annotations";
const LIDAR_STREAM = "/LIDAR_TOP";
const MAP_STREAM = "/map";
const RADAR_STREAM = "/RADAR_FRONT";
const DEFAULT_TEST_STREAMS = [STREAM] as const;

interface TimelineRange {
  readonly activeTimeline: "log";
  readonly byteTimeline?: readonly ByteTimelinePoint[];
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

interface DecodedMessage {
  readonly activeTimeline: "log";
  readonly channelId: number;
  readonly decoded: DecodeResult;
  readonly logTimeNs: bigint;
  readonly publishTimeNs: bigint;
  readonly sequence: number;
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}

interface TopicDecodeDiagnostic {
  readonly code: "message-decode-failed";
  readonly message: string;
  readonly messageTimeNs: bigint;
  readonly payloadIdentity: string;
  readonly requestedTimeNs: bigint;
  readonly topic: string;
}

interface SynchronizedMessageWindow {
  readonly activeTimeline: "log";
  readonly decodeErrorsByTopic?: Readonly<
    Record<string, readonly TopicDecodeDiagnostic[]>
  >;
  readonly endTimeNs: bigint;
  readonly messages: readonly DecodedMessage[];
  readonly messagesByTopic: Readonly<Record<string, readonly DecodedMessage[]>>;
  readonly startTimeNs: bigint;
  readonly streamPolicies: StreamSyncPolicies;
  readonly timeNs: bigint;
}

interface ResourceClient {
  readonly cancelIdleReads?: () => void;
  readonly cancelRunwayReads?: () => void;
  readDecodedMessages(
    request: {
      readonly activeTimeline?: "log";
      readonly endTimeNs?: bigint;
      readonly source: ByteSourceDescriptor;
      readonly startTimeNs?: bigint;
      readonly topics?: readonly string[];
    },
    options?: { readonly priority?: "bulk" | "current" | "idle" | "playback" },
  ): AsyncGenerator<DecodedMessage, void, void>;
  readSynchronizedMessageBatch(
    request: {
      readonly activeTimeline?: "log";
      readonly source: ByteSourceDescriptor;
      readonly streamPolicies?: StreamSyncPolicies;
      readonly timeNs: readonly bigint[];
      readonly topics: readonly string[];
    },
    options?: { readonly priority?: "bulk" | "current" | "idle" | "playback" },
  ): Promise<readonly SynchronizedMessageWindow[]>;
  readSynchronizedMessages(request: {
    readonly activeTimeline?: "log";
    readonly source: ByteSourceDescriptor;
    readonly streamPolicies?: StreamSyncPolicies;
    readonly timeNs: bigint;
    readonly topics: readonly string[];
  }): Promise<SynchronizedMessageWindow>;
  readTimelineRange(request: {
    readonly activeTimeline?: "log";
    readonly source: ByteSourceDescriptor;
  }): Promise<TimelineRange>;
  readTopicTimeBounds(request: {
    readonly activeTimeline?: "log";
    readonly source: ByteSourceDescriptor;
    readonly topics: readonly string[];
  }): Promise<
    readonly {
      readonly firstMessageTimeNs: bigint | null;
      readonly lastMessageTimeNs: bigint | null;
      readonly topic: string;
    }[]
  >;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("useRegisterDataStream", () => {
  it("enables seek-fetch debounce only for explicitly remote sources", () => {
    const remote = createSource(
      "remote-policy",
      BYTE_SOURCE_READ_PROFILE.REMOTE,
    );
    const local = createSource("local-policy", BYTE_SOURCE_READ_PROFILE.LOCAL);
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { rerender, unmount } = render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        source={remote}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();
    expect(getSeekFetchDebounceMs(store)).toBe(150);

    rerender(
      <Harness client={client} onStore={storeCapture.onStore} source={local} />,
    );
    expect(getSeekFetchDebounceMs(store)).toBe(0);

    unmount();
    expect(getSeekFetchDebounceMs(store)).toBe(0);
  });

  it("detaches transferred frame buffers when the renderer unmounts", async () => {
    const source = createSource("renderer-release");
    const storeCapture = capturePlaybackStore();
    const transferredBuffer = new ArrayBuffer(1024);
    let dataStream: DataStream | null = null;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(async (request) =>
        createWindow({
          resourceHints: {
            sizeBytes: transferredBuffer.byteLength,
            transferables: [transferredBuffer],
          },
          timeNs: request.timeNs,
          visualization: {
            bytes: new Uint8Array(transferredBuffer),
            kind: VISUALIZATION_KIND.ENCODED_IMAGE,
          },
        }),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { unmount } = render(
      <Harness
        client={client}
        onDataStream={(next) => {
          dataStream = next;
        }}
        onStore={storeCapture.onStore}
        source={source}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(dataStream?.getStreamCache(STREAM)?.stats().decodedBytes).toBe(
        1024,
      );
    });
    const currentDataStream = dataStream as DataStream | null;
    const retainedCache = currentDataStream?.getStreamCache(STREAM);
    if (!retainedCache) throw new Error("stream cache was not registered");

    unmount();

    expect(retainedCache.stats()).toMatchObject({
      decodedBytes: 0,
      entryCount: 0,
    });
    expect(retainedCache.stats().accountedBytes).toBe(0);
    expect(transferredBuffer.byteLength).toBe(0);
  });

  it("reindexes at a committed sampling rate without resetting the playhead", async () => {
    const source = createSource("sampling-rate");
    const storeCapture = capturePlaybackStore();
    let dataStream: DataStream | null = null;
    let api: ReturnType<typeof usePlayback> | null = null;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onApi={(next) => {
          api = next;
        }}
        onDataStream={(next) => {
          dataStream = next;
        }}
        onStore={storeCapture.onStore}
        source={source}
        timelineSamplingRateHz={24}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(dataStream?.getTimelineIndex()?.tickRateHz).toBe(24);
    });
    act(() => {
      api?.seek(0.5);
    });
    expect(getPlayhead(storeCapture.store())).toBe(0.5);

    rerender(
      <Harness
        client={client}
        onApi={(next) => {
          api = next;
        }}
        onDataStream={(next) => {
          dataStream = next;
        }}
        onStore={storeCapture.onStore}
        source={source}
        timelineSamplingRateHz={60}
      />,
    );

    await waitFor(() => {
      expect(dataStream?.getTimelineIndex()?.tickRateHz).toBe(60);
    });
    expect(getPlayhead(storeCapture.store())).toBe(0.5);
  });

  it("renders through mandatory session reads without playback acceleration", async () => {
    const source = createSource("mandatory-read");
    const storeCapture = capturePlaybackStore();
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<ResourceClient["readDecodedMessages"]>[0],
    ) {
      yield createDecodedMessage({
        stream: request.topics?.[0] ?? STREAM,
        timeNs: request.startTimeNs ?? 0n,
        visualization: {
          bytes: new Uint8Array([1]),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      });
    });
    const readSynchronizedMessageBatch = vi.fn(async () => {
      throw new Error("Playback acceleration must not be required");
    });
    const readSynchronizedMessages = vi.fn(async () => {
      throw new Error("Playback acceleration must not be required");
    });
    const client = createClient({
      readDecodedMessages,
      readSynchronizedMessageBatch,
      readSynchronizedMessages,
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        client={client}
        onStore={storeCapture.onStore}
        playbackAcceleration={false}
        source={source}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(getStreamStatus(storeCapture.store(), STREAM)).toBe("ready");
    });
    expect(getStreamValue(storeCapture.store(), STREAM)).not.toBeNull();
    expect(readDecodedMessages).toHaveBeenCalled();
    expect(readSynchronizedMessages).not.toHaveBeenCalled();
    expect(readSynchronizedMessageBatch).not.toHaveBeenCalled();
  });

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
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async ({ source }) => [
        {
          firstMessageTimeNs:
            source.sourceId === sourceB.sourceId ? 10_000_000n : 0n,
          lastMessageTimeNs: 1_000_000_000n,
          topic: STREAM,
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

  it("starts at the latest short-skew stream and ignores long gaps", async () => {
    const source = createSource("mixed-starts");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const streams = [STREAM, LIDAR_STREAM, MAP_STREAM, RADAR_STREAM] as const;
    const readDecodedMessages = vi.fn(async function* () {
      for (const item of [] as never[]) yield item;
    });
    const readTopicTimeBounds = vi.fn(async () => [
      {
        firstMessageTimeNs: 0n,
        lastMessageTimeNs: 1_000_000_000n,
        topic: STREAM,
      },
      {
        firstMessageTimeNs: 10_000_000n,
        lastMessageTimeNs: 1_000_000_000n,
        topic: LIDAR_STREAM,
      },
      {
        firstMessageTimeNs: 20_000_000n,
        lastMessageTimeNs: 1_000_000_000n,
        topic: MAP_STREAM,
      },
      {
        firstMessageTimeNs: 800_000_000n,
        lastMessageTimeNs: 1_000_000_000n,
        topic: RADAR_STREAM,
      },
    ]);
    const client = createClient({
      readDecodedMessages,
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds,
    });

    render(
      <Harness
        allStreams={streams}
        blockingStreams={streams}
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
        staleWarningStreams={streams}
        subscribedStreams={streams}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(getPlayhead(storeCapture.store())).toBeCloseTo(1 / 30, 6);
    });
    expect(readTopicTimeBounds).toHaveBeenCalledTimes(1);
    expect(readDecodedMessages).not.toHaveBeenCalled();

    act(() => api?.seek(0));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getPlayhead(storeCapture.store())).toBe(0);
  });

  it("includes a start at the 500ms threshold", async () => {
    const source = createSource("threshold-start");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async () => [
        {
          firstMessageTimeNs: 500_000_000n,
          lastMessageTimeNs: 1_000_000_000n,
          topic: STREAM,
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

    await waitFor(() => {
      expect(getPlayhead(storeCapture.store())).toBeCloseTo(16 / 30, 6);
    });
  });

  it("leaves a start beyond 500ms at the recording origin", async () => {
    const source = createSource("long-gap");
    const storeCapture = capturePlaybackStore();
    const readTopicTimeBounds = vi.fn(async () => [
      {
        firstMessageTimeNs: 500_000_001n,
        lastMessageTimeNs: 1_000_000_000n,
        topic: STREAM,
      },
    ]);
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds,
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
      expect(readTopicTimeBounds).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getPlayhead(storeCapture.store())).toBe(0);
  });

  it.each([
    [
      "the playhead has moved",
      (api: ReturnType<typeof usePlayback>) => api.seek(0.25),
      0.25,
    ] as const,
    [
      "play has been requested",
      (api: ReturnType<typeof usePlayback>) => api.play(),
      0,
    ] as const,
  ])(
    "does not auto-seek after %s",
    async (_condition, beforeBounds, expected) => {
      const source = createSource(`guarded-${expected}`);
      const storeCapture = capturePlaybackStore();
      const bounds = deferred<
        readonly {
          readonly firstMessageTimeNs: bigint | null;
          readonly lastMessageTimeNs: bigint | null;
          readonly topic: string;
        }[]
      >();
      let api: ReturnType<typeof usePlayback> | undefined;
      const readTopicTimeBounds = vi.fn(() => bounds.promise);
      const client = createClient({
        readSynchronizedMessageBatch: vi.fn(
          () =>
            new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
        ),
        readSynchronizedMessages: vi.fn(
          () => new Promise<SynchronizedMessageWindow>(() => undefined),
        ),
        readTimelineRange: vi.fn(async () => createTimelineRange()),
        readTopicTimeBounds,
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
        expect(readTopicTimeBounds).toHaveBeenCalledTimes(1);
      });
      const capturedApi = api;
      if (!capturedApi) throw new Error("Playback API was not captured");
      act(() => beforeBounds(capturedApi));
      await act(async () => {
        bounds.resolve([
          {
            firstMessageTimeNs: 10_000_000n,
            lastMessageTimeNs: 1_000_000_000n,
            topic: STREAM,
          },
        ]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(getPlayhead(storeCapture.store())).toBe(expected);
    },
  );

  it("ignores in-flight batch results after the source changes", async () => {
    const sourceA = createSource("source-a");
    const sourceB = createSource("source-b");
    const sourceBTimeline = deferred<TimelineRange>();
    const oldBatch = deferred<readonly SynchronizedMessageWindow[]>();
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
    expect(getStreamValue(store, STREAM)).toBeNull();
  });

  it("ignores idle cancellation from a session disposed during a source reset", () => {
    const session: Pick<EpisodeSession, "cancelIdle"> = {
      cancelIdle: () => {
        throw new EpisodeReadCancelledError();
      },
    };

    expect(() => cancelIdleReads(session)).not.toThrow();
  });

  it("surfaces unexpected idle cancellation failures", () => {
    const failure = new Error("transport failed");
    const session: Pick<EpisodeSession, "cancelIdle"> = {
      cancelIdle: () => {
        throw failure;
      },
    };

    expect(() => cancelIdleReads(session)).toThrow(failure);
  });

  it("ignores runway cancellation from a session disposed during a seek", () => {
    const session: Pick<EpisodeSession, "cancelRunway"> = {
      cancelRunway: () => {
        throw new EpisodeReadCancelledError();
      },
    };

    expect(() => cancelRunwayReads(session)).not.toThrow();
  });

  it("cancels obsolete runway before admitting only local seek-target work", async () => {
    const rebalanceDecodedCaches = vi.spyOn(
      decodedCachePolicy,
      "rebalanceDecodedCaches",
    );
    const source = createSource(
      "local-seek-cancellation",
      BYTE_SOURCE_READ_PROFILE.LOCAL,
    );
    let api: ReturnType<typeof usePlayback> | undefined;
    const storeCapture = capturePlaybackStore();
    const cancelRunway = vi.fn();
    const readSynchronizedMessageBatch = vi.fn(async () => []);
    const readSynchronizedMessages = vi.fn(async (request) =>
      createEmptyWindow(request.timeNs),
    );
    const client = createClient({
      cancelRunwayReads: cancelRunway,
      readSynchronizedMessageBatch,
      readSynchronizedMessages,
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

    await waitFor(() => {
      expect(readSynchronizedMessageBatch).toHaveBeenCalled();
    });
    cancelRunway.mockClear();
    readSynchronizedMessageBatch.mockClear();
    readSynchronizedMessages.mockClear();
    rebalanceDecodedCaches.mockClear();

    act(() => api?.seek(30));

    expect(cancelRunway).toHaveBeenCalledOnce();
    expect(rebalanceDecodedCaches).toHaveBeenCalledWith(
      expect.objectContaining({
        activeStreams: [STREAM],
        blockingStreams: [STREAM],
        placementCeiling: 120_000,
      }),
    );
    expect(readSynchronizedMessages).toHaveBeenCalled();
    expect(readSynchronizedMessageBatch).not.toHaveBeenCalled();
    expect(rebalanceDecodedCaches.mock.invocationCallOrder[0]).toBeLessThan(
      readSynchronizedMessages.mock.invocationCallOrder[0],
    );
    expect(cancelRunway.mock.invocationCallOrder[0]).toBeLessThan(
      readSynchronizedMessages.mock.invocationCallOrder[0],
    );
    rebalanceDecodedCaches.mockRestore();
  });

  it("ignores in-flight batch results after stream unsubscribe", async () => {
    const source = createSource("source");
    const oldBatch = deferred<readonly SynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    const cancelRunwayReads = vi.fn();
    const client = createClient({
      cancelRunwayReads,
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
    expect(cancelRunwayReads).toHaveBeenCalled();

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

    expect(getStreamValue(store, STREAM)).toBeNull();
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

  it("uses a three-tick startup runway for local recordings", async () => {
    const source = createSource("local-source", "local");
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
    expect(request?.timeNs).toHaveLength(3);
    expect(request?.timeNs.at(-1)).toBeLessThanOrEqual(100_000_000n);
  });

  it("starts multi-stream playback across all active panes with a bounded startup window", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        allStreams={[LIDAR_STREAM, RADAR_STREAM, STREAM]}
        blockingStreams={[LIDAR_STREAM, RADAR_STREAM, STREAM]}
        client={client}
        onStore={storeCapture.onStore}
        source={source}
        subscribedStreams={[LIDAR_STREAM, RADAR_STREAM, STREAM]}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });

    const firstBatch = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls[0];
    expect(firstBatch?.[0].topics).toEqual([
      LIDAR_STREAM,
      RADAR_STREAM,
      STREAM,
    ]);
    expect(firstBatch?.[0].timeNs.length).toBeLessThanOrEqual(15);
    expect(firstBatch?.[1]?.priority).toBe("playback");

    await waitFor(() => {
      expect(client.readSynchronizedMessages).toHaveBeenCalled();
    });
    const firstCurrentFrame = vi.mocked(client.readSynchronizedMessages).mock
      .calls[0]?.[0];
    expect(firstCurrentFrame?.topics).toEqual([
      LIDAR_STREAM,
      RADAR_STREAM,
      STREAM,
    ]);
  });

  it("queues blocking current-frame data before non-blocking map overlays", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        allStreams={[MAP_STREAM, STREAM]}
        blockingStreams={[STREAM]}
        client={client}
        onStore={storeCapture.onStore}
        source={source}
        subscribedStreams={[MAP_STREAM, STREAM]}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessages).toHaveBeenCalledTimes(2);
    });
    const calls = vi.mocked(client.readSynchronizedMessages).mock.calls;
    expect(calls[0]?.[0].topics).toEqual([STREAM]);
    expect(calls[1]?.[0].topics).toEqual([MAP_STREAM]);
  });

  it("does not queue idle background lookahead while startup data is still in flight", async () => {
    const source = createSource("source");
    const startupBatch = deferred<readonly SynchronizedMessageWindow[]>();
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
    const startupBatch = deferred<readonly SynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    let startupRequest:
      | Parameters<ResourceClient["readSynchronizedMessageBatch"]>[0]
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

  it("starts playback without buffering when no playback streams are active", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <PlaybackProvider duration={0}>
        <DataStreamProvider>
          <Harness
            client={client}
            onApi={(value) => {
              api = value;
            }}
            onStore={storeCapture.onStore}
            source={source}
            subscribe={false}
          />
        </DataStreamProvider>
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
    const startupBatch = deferred<readonly SynchronizedMessageWindow[]>();
    const storeCapture = capturePlaybackStore();
    let startupRequest:
      | Parameters<ResourceClient["readSynchronizedMessageBatch"]>[0]
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
    expect(idleCall?.[0].topics).toEqual([STREAM]);
  });

  it("defers circular continuation after a paused seek until play is pending", async () => {
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
      readTimelineRange: vi.fn(async () =>
        createTimelineRange(10_000_000_000n),
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
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalled();
    });
    const mountBatchCalls = vi.mocked(client.readSynchronizedMessageBatch).mock
      .calls.length;

    act(() => {
      api?.setLoop(6, 8);
      api?.seek(7.75);
    });
    expect(client.readSynchronizedMessageBatch).toHaveBeenCalledTimes(
      mountBatchCalls,
    );

    act(() => api?.play());

    await waitFor(
      () => {
        expect(
          vi
            .mocked(client.readSynchronizedMessageBatch)
            .mock.calls.slice(mountBatchCalls)
            .some(
              ([request, options]) =>
                options?.priority === "playback" &&
                (request.timeNs[0] ?? 0n) >= 6_000_000_000n &&
                (request.timeNs[0] ?? 0n) < 6_100_000_000n,
            ),
        ).toBe(true);
      },
      { timeout: 2000 },
    );

    const loopbackCall = vi
      .mocked(client.readSynchronizedMessageBatch)
      .mock.calls.slice(mountBatchCalls)
      .find(
        ([request, options]) =>
          options?.priority === "playback" &&
          (request.timeNs[0] ?? 0n) >= 6_000_000_000n &&
          (request.timeNs[0] ?? 0n) < 6_100_000_000n,
      );
    expect(loopbackCall?.[1]?.priority).toBe("playback");
    expect(loopbackCall?.[0].timeNs.length).toBeGreaterThan(0);
    expect(loopbackCall?.[0].timeNs[0]).toBeGreaterThanOrEqual(6_000_000_000n);
  });

  it("does not readmit idle lookahead after a paused seek", async () => {
    const source = createSource("source");
    const batches: Array<{
      readonly request: Parameters<
        ResourceClient["readSynchronizedMessageBatch"]
      >[0];
      readonly resolve: (windows: readonly SynchronizedMessageWindow[]) => void;
      readonly promise: Promise<readonly SynchronizedMessageWindow[]>;
    }> = [];
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn((request) => {
        const batch = deferred<readonly SynchronizedMessageWindow[]>();
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
    vi.mocked(client.readSynchronizedMessageBatch).mockClear();

    act(() => {
      api?.seek(0.001);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(client.readSynchronizedMessageBatch).not.toHaveBeenCalled();
  });

  it("reports 'loading' while the current frame is in flight, then 'ready' when it lands", async () => {
    const source = createSource("source");
    const current = deferred<SynchronizedMessageWindow>();
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
      expect(getStreamStatus(store, STREAM)).toBe("loading");
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
      expect(getStreamStatus(store, STREAM)).toBe("ready");
      expect(getBufferingDetail(store)).toBeNull();
      expect(getStreamValue(store, STREAM)).not.toBeNull();
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

  it("reports 'gap' when the fetched tick has no message for the stream", async () => {
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
      expect(getStreamStatus(store, STREAM)).toBe("gap");
    });
    // No message was ever resolved, so no frame is published either.
    expect(getStreamValue(store, STREAM)).toBeNull();
  });

  it("cancels shared speculative reads only after the final tile closes", async () => {
    const source = createSource("shared-tile-session");
    const storeCapture = capturePlaybackStore();
    const cancelIdleReads = vi.fn();
    const cancelRunwayReads = vi.fn();
    let dataStream: DataStream | null = null;
    const client = createClient({
      cancelIdleReads,
      cancelRunwayReads,
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    render(
      <Harness
        allStreams={[STREAM, LIDAR_STREAM]}
        blockingStreams={[STREAM, LIDAR_STREAM]}
        client={client}
        onDataStream={(next) => {
          dataStream = next;
        }}
        onStore={storeCapture.onStore}
        source={source}
        subscribe={false}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(dataStream?.getTimelineIndex()).not.toBeNull();
    });
    const currentDataStream = dataStream as DataStream | null;
    if (!currentDataStream) throw new Error("data stream was not registered");
    let closeImage: () => void = () => undefined;
    let closePointCloud: () => void = () => undefined;
    act(() => {
      closeImage = currentDataStream.subscribeToStream(STREAM);
      closePointCloud = currentDataStream.subscribeToStream(LIDAR_STREAM);
    });
    expect(currentDataStream.getStreamCache(STREAM)?.isActive).toBe(true);
    expect(currentDataStream.getStreamCache(LIDAR_STREAM)?.isActive).toBe(true);
    cancelIdleReads.mockClear();
    cancelRunwayReads.mockClear();

    act(() => closeImage());
    expect(currentDataStream.getStreamCache(STREAM)?.isActive).toBe(false);
    expect(currentDataStream.getStreamCache(LIDAR_STREAM)?.isActive).toBe(true);
    expect(cancelIdleReads).not.toHaveBeenCalled();
    expect(cancelRunwayReads).not.toHaveBeenCalled();

    act(() => closePointCloud());
    expect(currentDataStream.getStreamCache(LIDAR_STREAM)?.isActive).toBe(
      false,
    );
    expect(cancelIdleReads).toHaveBeenCalledOnce();
    expect(cancelRunwayReads).toHaveBeenCalledOnce();
  });

  it("keeps displaying old media and marks it stale past the adaptive threshold", async () => {
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
          topic: STREAM,
        },
      ]),
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
      const value = getStreamValue(store, STREAM) as StreamPlaybackFrame | null;
      expect(value?.contentTimeNs).toBe(0n);
      expect(getStreamStatus(store, STREAM)).toBe("ready");
    });

    await act(async () => {
      api?.seek(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      const value = getStreamValue(store, STREAM) as StreamPlaybackFrame | null;
      expect(value).not.toBeNull();
      expect(value?.contentTimeNs).toBe(0n);
      expect(value?.requestedTimeNs).toBeGreaterThan(500_000_000n);
      expect(value?.ageNs).toBe(value?.requestedTimeNs);
      expect(getStreamStatus(store, STREAM)).toBe("stale");
    });
  });

  it("holds annotation geometry and marks it stale after its adaptive threshold", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(async () => []),
      readSynchronizedMessages: vi.fn(async (request) =>
        request.timeNs === 0n
          ? createWindow({
              timeNs: 0n,
              stream: IMAGE_ANNOTATION_STREAM,
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
              stream: IMAGE_ANNOTATION_STREAM,
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
          topic: IMAGE_ANNOTATION_STREAM,
        },
      ]),
    });

    render(
      <Harness
        allStreams={[IMAGE_ANNOTATION_STREAM]}
        blockingStreams={[IMAGE_ANNOTATION_STREAM]}
        client={client}
        onApi={(value) => {
          api = value;
        }}
        onStore={storeCapture.onStore}
        source={source}
        staleWarningStreams={[IMAGE_ANNOTATION_STREAM]}
        subscribedStreams={[IMAGE_ANNOTATION_STREAM]}
      />,
      { wrapper: TestProviders },
    );
    const store = storeCapture.store();

    await waitFor(() => {
      expect(getStreamStatus(store, IMAGE_ANNOTATION_STREAM)).toBe("ready");
    });

    await act(async () => {
      api?.seek(1);
      await Promise.resolve();
    });

    await waitFor(() => {
      const value = getStreamValue(
        store,
        IMAGE_ANNOTATION_STREAM,
      ) as StreamPlaybackFrame | null;
      expect(value).not.toBeNull();
      expect(value?.contentTimeNs).toBe(0n);
      expect(value?.requestedTimeNs).toBeGreaterThan(500_000_000n);
      expect(getStreamStatus(store, IMAGE_ANNOTATION_STREAM)).toBe("stale");
    });
  });

  it("marks the stream 'failed' after repeated fetch failures and stops stalling on those ticks", async () => {
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
        expect(getStreamStatus(store, STREAM)).toBe("failed");
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("increments failure state only for the stream whose payload decode failed", async () => {
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
          allStreams={[STREAM, LIDAR_STREAM]}
          blockingStreams={[STREAM, LIDAR_STREAM]}
          client={client}
          onApi={(playback) => {
            api = playback;
          }}
          onStore={storeCapture.onStore}
          source={source}
          subscribedStreams={[STREAM, LIDAR_STREAM]}
        />,
        { wrapper: TestProviders },
      );
      const store = storeCapture.store();

      await waitFor(() => {
        expect(getStreamStatus(store, LIDAR_STREAM)).toBe("ready");
        expect(getStreamValue(store, LIDAR_STREAM)).not.toBeNull();
      });
      await act(async () => {
        api?.seek(0.5);
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(getStreamStatus(store, STREAM)).toBe("failed");
      });
      expect(getStreamStatus(store, LIDAR_STREAM)).toBe("ready");
      expect(getStreamValue(store, LIDAR_STREAM)).not.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("giving up on streams"),
        [STREAM],
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
        readonly promise: Promise<SynchronizedMessageWindow>;
        readonly reject: (reason?: unknown) => void;
        readonly resolve: (value: SynchronizedMessageWindow) => void;
      };
    }> = [];
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn((request) => {
        const handle = deferred<SynchronizedMessageWindow>();
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
      expect(getStreamStatus(store, STREAM)).toBe("loading");
    });

    // The engine's missing-data admission issues a priority fetch for the
    // seeked tick; resolving it is the "workers caught up" moment.
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
      expect(getStreamStatus(store, STREAM)).toBe("ready");
    });
  });

  it("bounds remote request admission to the settled target during a seek burst", async () => {
    const source = createSource(
      "remote-seek-census",
      BYTE_SOURCE_READ_PROFILE.REMOTE,
    );
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    const readSynchronizedMessageBatch = vi.fn(
      (
        _request: Parameters<ResourceClient["readSynchronizedMessageBatch"]>[0],
      ) => new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
    );
    const readSynchronizedMessages = vi.fn(
      (_request: Parameters<ResourceClient["readSynchronizedMessages"]>[0]) =>
        new Promise<SynchronizedMessageWindow>(() => undefined),
    );
    const client = createClient({
      readSynchronizedMessageBatch,
      readSynchronizedMessages,
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

    await waitFor(() => {
      expect(readSynchronizedMessageBatch).toHaveBeenCalled();
      expect(readSynchronizedMessages).toHaveBeenCalled();
    });
    const initialBatchCalls = readSynchronizedMessageBatch.mock.calls.length;
    const initialCurrentCalls = readSynchronizedMessages.mock.calls.length;

    act(() => {
      for (let second = 1; second <= 30; second++) {
        api?.seek(second);
      }
    });

    // Visual-only positions must not cross the data-plane boundary.
    expect(getPlayhead(storeCapture.store())).toBe(30);
    expect(readSynchronizedMessageBatch).toHaveBeenCalledTimes(
      initialBatchCalls,
    );
    expect(readSynchronizedMessages).toHaveBeenCalledTimes(initialCurrentCalls);

    await waitFor(() => {
      expect(readSynchronizedMessages).toHaveBeenCalledTimes(
        initialCurrentCalls + 1,
      );
    });

    const settledCurrentRequest =
      readSynchronizedMessages.mock.calls.at(-1)?.[0];
    expect(settledCurrentRequest?.timeNs).toBeGreaterThan(29_000_000_000n);
    expect(readSynchronizedMessageBatch).toHaveBeenCalledTimes(
      initialBatchCalls,
    );
  });

  it("keeps a paused seek current-only and admits runway when play becomes pending", async () => {
    const source = createSource("paused-seek-play");
    const storeCapture = capturePlaybackStore();
    let api: ReturnType<typeof usePlayback> | undefined;
    let idleRead:
      | {
          readonly promise: Promise<readonly SynchronizedMessageWindow[]>;
          readonly reject: (reason?: unknown) => void;
        }
      | undefined;
    const readSynchronizedMessageBatch = vi.fn(
      (
        request: Parameters<ResourceClient["readSynchronizedMessageBatch"]>[0],
        options?: Parameters<ResourceClient["readSynchronizedMessageBatch"]>[1],
      ) => {
        if (options?.priority === "idle") {
          idleRead = deferred<readonly SynchronizedMessageWindow[]>();
          return idleRead.promise;
        }
        return Promise.resolve(request.timeNs.map(createEmptyWindow));
      },
    );
    const cancelIdleReads = vi.fn(() => {
      idleRead?.reject(new EpisodeReadCancelledError());
    });
    const readSynchronizedMessages = vi.fn(async (request) =>
      createEmptyWindow(request.timeNs),
    );
    const client = createClient({
      cancelIdleReads,
      readSynchronizedMessageBatch,
      readSynchronizedMessages,
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

    await waitFor(() => {
      expect(readSynchronizedMessageBatch).toHaveBeenCalled();
      expect(readSynchronizedMessages).toHaveBeenCalled();
    });
    const batchCallsBeforeSeek = readSynchronizedMessageBatch.mock.calls.length;

    act(() => api?.seek(30));
    await waitFor(() => {
      expect(
        readSynchronizedMessages.mock.calls.at(-1)?.[0].timeNs ?? 0n,
      ).toBeGreaterThan(29_900_000_000n);
    });
    expect(readSynchronizedMessageBatch).toHaveBeenCalledTimes(
      batchCallsBeforeSeek,
    );
    const playbackCallsBeforePlay =
      readSynchronizedMessageBatch.mock.calls.filter(
        ([, options]) => options?.priority === "playback",
      ).length;

    act(() => api?.play());

    await waitFor(() => {
      expect(cancelIdleReads).toHaveBeenCalled();
      expect(
        readSynchronizedMessageBatch.mock.calls.filter(
          ([, options]) => options?.priority === "playback",
        ).length,
      ).toBeGreaterThan(playbackCallsBeforePlay);
    });
    const resumedRunway = [...readSynchronizedMessageBatch.mock.calls]
      .reverse()
      .find(
        ([request, options]) =>
          options?.priority === "playback" &&
          (request.timeNs[0] ?? 0n) > 29_900_000_000n,
      );
    expect(resumedRunway).toBeDefined();
    await waitFor(() => {
      expect(getIsPlaying(storeCapture.store())).toBe(true);
      expect(getIsBuffering(storeCapture.store())).toBe(false);
    });
  });

  it("seeks current-only, then prefetches virtual ticks when play is pending", async () => {
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
    const initialBatchTicks = batchTicks.length;

    act(() => api?.seek(3_600));

    await waitFor(() => {
      expect(currentFrameTicks.some((tick) => tick > 3_000_000_000_000n)).toBe(
        true,
      );
    });
    expect(batchTicks).toHaveLength(initialBatchTicks);

    act(() => api?.play());
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
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
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

  it("auto-forwards the initial playhead to the first tick with indexed stream data", async () => {
    const source = createSource("source");
    const storeCapture = capturePlaybackStore();
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(
        () =>
          new Promise<readonly SynchronizedMessageWindow[]>(() => undefined),
      ),
      readSynchronizedMessages: vi.fn(
        () => new Promise<SynchronizedMessageWindow>(() => undefined),
      ),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
      readTopicTimeBounds: vi.fn(async () => [
        {
          firstMessageTimeNs: 10_000_000n,
          lastMessageTimeNs: 1_000_000_000n,
          topic: STREAM,
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
          : new Promise<SynchronizedMessageWindow>(() => undefined),
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
      expect(getStreamValue(store, STREAM)).not.toBeNull();
    });
    const previousFrame = getStreamValue(store, STREAM);

    act(() => {
      api?.seek(0.9);
    });

    // The debounced seek keeps the previous frame until foreground data for
    // the target arrives. Stream status makes that retained content explicit.
    await waitFor(() => {
      expect(getStreamStatus(store, STREAM)).toBe("loading");
    });
    expect(getStreamValue(store, STREAM)).toBe(previousFrame);
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
      setNetworkHealth(store, {
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
      expect(getStartupCushionState(store)?.targetSeconds).toBe(1);
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
      expect(getStartupCushionState(store)).toBeNull();
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
      setNetworkHealth(store, {
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
    expect(getStartupCushionState(store)).toBeNull();
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
    expect(getStartupCushionState(store)).toBeNull();

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
      expect(getStartupCushionState(store)?.targetSeconds).toBe(6);
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
      setNetworkHealth(store, {
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
      expect(getStartupCushionState(store)?.targetSeconds).toBe(4);
    });

    // Mid-hold the rolling window turns over and briefly reads the link
    // as effectively infinite. The pending session's pessimistic envelope
    // must keep the 4s requirement instead of collapsing to the floor
    // and starting into the known deficit.
    act(() => {
      setNetworkHealth(store, {
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
      expect(getStartupCushionState(store)?.targetSeconds).toBe(4);
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
      expect(getStartupCushionState(store)?.targetSeconds).toBe(6);
    });
    expect(getIsPlaying(store)).toBe(false);

    // The pending prefetch produced real samples; the link measures far
    // above the content bitrate, so the plan re-resolves to the floor and
    // the already-covered window releases the press.
    act(() => {
      setNetworkHealth(store, {
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
      expect(getStartupCushionState(store)).toBeNull();
    });
  });
});

function Harness({
  allStreams = DEFAULT_TEST_STREAMS,
  blockingStreams = DEFAULT_TEST_STREAMS,
  client,
  onStore,
  onApi,
  onDataStream,
  playbackAcceleration = true,
  source,
  staleWarningStreams = DEFAULT_TEST_STREAMS,
  subscribe = true,
  subscribedStreams = DEFAULT_TEST_STREAMS,
  streamPolicies = {},
  timelineSamplingRateHz = 30,
}: {
  readonly allStreams?: readonly string[];
  readonly blockingStreams?: readonly string[];
  readonly client: ResourceClient;
  readonly onStore: (store: PlaybackStore) => void;
  readonly onApi?: (api: ReturnType<typeof usePlayback>) => void;
  readonly onDataStream?: (dataStream: DataStream | null) => void;
  readonly playbackAcceleration?: boolean;
  readonly source: ByteSourceDescriptor | null;
  readonly staleWarningStreams?: readonly string[];
  readonly subscribe?: boolean;
  readonly subscribedStreams?: readonly string[];
  readonly streamPolicies?: StreamSyncPolicies;
  readonly timelineSamplingRateHz?: number;
}) {
  const dataStream = useDataStream();
  const store = usePlaybackStore();
  const api = usePlayback();
  const session = useTestSession(
    client,
    source,
    allStreams,
    playbackAcceleration,
  );
  const streamNames = useMemo(
    () => new Map(allStreams.map((stream) => [stream, stream])),
    [allStreams],
  );
  useRegisterDataStream({
    allStreams,
    blockingStreams,
    endBoundedStreams: [],
    session,
    source,
    staleWarningStreams,
    streamNames,
    streamPolicies: streamPolicies as unknown as StreamSyncPolicies,
    timelineSamplingRateHz,
  });

  // This effect exposes the playback store to each test case.
  useEffect(() => {
    onStore(store);
  }, [onStore, store]);

  // This effect exposes the registered data-stream API to tests that need it.
  useEffect(() => {
    onApi?.(api);
  }, [onApi, api]);

  useEffect(() => {
    onDataStream?.(dataStream);
  }, [dataStream, onDataStream]);

  // This effect mirrors fixture subscriptions through the registered stream.
  useEffect(() => {
    if (!subscribe) return undefined;

    const cleanups = subscribedStreams.map((stream) =>
      dataStream?.subscribeToStream(stream),
    );
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
  }, [dataStream, subscribe, subscribedStreams]);

  return null;
}

function TestProviders({ children }: { readonly children: ReactNode }) {
  return (
    <PlaybackProvider duration={1}>
      <DataStreamProvider>{children}</DataStreamProvider>
    </PlaybackProvider>
  );
}

function useTestSession(
  client: ResourceClient,
  source: ByteSourceDescriptor | null,
  streams: readonly string[],
  playbackAcceleration: boolean,
): EpisodeSession | null {
  const [session, setSession] = useState<EpisodeSession | null>(null);

  // This effect builds the asynchronous session fixture for the active source
  // and ignores completion after the fixture is replaced.
  useEffect(() => {
    if (!source) {
      setSession(null);
      return undefined;
    }
    let active = true;
    void client
      .readTimelineRange({
        activeTimeline: "log",
        source,
      })
      .then((range) => {
        if (!active) return;
        const toFrame = (message: DecodedMessage): DecodedFrame => ({
          output: message.decoded.output,
          sequence: message.sequence,
          sourceTimestamps: {
            logTime: message.logTimeNs,
            publishTime: message.publishTimeNs,
          },
          streamId: message.topic,
          timestampNs: message.timelineTimeNs,
        });
        const toWindow = (
          window: SynchronizedMessageWindow,
        ): SynchronizedFrameWindow => ({
          diagnosticsByStream: Object.fromEntries(
            Object.entries(window.decodeErrorsByTopic ?? {}).map(
              ([streamId, diagnostics]) => [
                streamId,
                diagnostics.map((diagnostic) => ({
                  code: "frame-decode-failed" as const,
                  message: diagnostic.message,
                  payloadIdentity: diagnostic.payloadIdentity,
                  requestedTimeNs: diagnostic.requestedTimeNs,
                  streamId,
                  timestampNs: diagnostic.messageTimeNs,
                })),
              ],
            ),
          ),
          endNs: window.endTimeNs,
          frames: window.messages.map(toFrame),
          framesByStream: Object.fromEntries(
            Object.entries(window.messagesByTopic).map(
              ([streamId, messages]) => [streamId, messages.map(toFrame)],
            ),
          ),
          startNs: window.startTimeNs,
          streamPolicies: {},
          timeNs: window.timeNs,
        });
        setSession({
          cancelIdle: () => client.cancelIdleReads?.(),
          cancelRunway: () => client.cancelRunwayReads?.(),
          dispose: () => undefined,
          manifest: {
            episodeId: source.sourceId,
            streams: streams.map((stream) => ({
              id: stream,
              kind: "unknown" as const,
              payload: { encoding: "test" },
              sourceName: stream,
              timeRange: {
                endNs: range.endTimeNs,
                startNs: range.startTimeNs,
              },
            })),
            timeDomain: { id: "log", kind: "timestamp" },
            timeRange: { endNs: range.endTimeNs, startNs: range.startTimeNs },
          },
          ...(playbackAcceleration
            ? {
                playback: {
                  timeline: {
                    byteTimeline: range.byteTimeline,
                    endNs: range.endTimeNs,
                    startNs: range.startTimeNs,
                    timeDomainId: "log",
                  },
                  readStreamTimeBounds: async (streams) =>
                    (
                      await client.readTopicTimeBounds({
                        activeTimeline: "log",
                        source,
                        topics: streams,
                      })
                    ).map((bound) => ({
                      firstTimestampNs: bound.firstMessageTimeNs,
                      lastTimestampNs: bound.lastMessageTimeNs,
                      streamId: bound.topic,
                    })),
                  readSynchronized: async (request) =>
                    toWindow(
                      await client.readSynchronizedMessages({
                        activeTimeline: "log",
                        source,
                        streamPolicies: request.streamPolicies,
                        timeNs: request.timeNs,
                        topics: request.streams,
                      }),
                    ),
                  readSynchronizedBatch: async (request, options) =>
                    (
                      await client.readSynchronizedMessageBatch(
                        {
                          activeTimeline: "log",
                          source,
                          streamPolicies: request.streamPolicies,
                          timeNs: request.timeNs,
                          topics: request.streams,
                        },
                        options,
                      )
                    ).map(toWindow),
                },
              }
            : {}),
          async *read(request) {
            for await (const message of client.readDecodedMessages(
              {
                activeTimeline: "log",
                endTimeNs: request.window.endNs,
                source,
                startTimeNs: request.window.startNs,
                topics: request.streams,
              },
              { priority: request.priority },
            )) {
              const frame = toFrame(message);
              yield { frames: [frame], stream: frame.streamId };
            }
          },
        });
      })
      .catch(() => setSession(null));
    return () => {
      active = false;
      setSession(null);
    };
  }, [client, playbackAcceleration, source, streams]);
  return session;
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
  cancelIdleReads,
  cancelRunwayReads,
  readDecodedMessages = vi.fn(async function* () {
    for (const item of [] as never[]) yield item;
  }),
  readSynchronizedMessageBatch,
  readTimelineRange,
  // The priority current-frame lane fires on mount/seek; default to a
  // never-settling promise so tests that only exercise the batch lane
  // aren't affected by it.
  readSynchronizedMessages = vi.fn(
    () => new Promise<SynchronizedMessageWindow>(() => undefined),
  ),
  readTopicTimeBounds = vi.fn(async () => []),
}: {
  readonly cancelIdleReads?: ResourceClient["cancelIdleReads"];
  readonly cancelRunwayReads?: ResourceClient["cancelRunwayReads"];
  readonly readDecodedMessages?: ResourceClient["readDecodedMessages"];
  readonly readSynchronizedMessageBatch: ResourceClient["readSynchronizedMessageBatch"];
  readonly readTimelineRange: ResourceClient["readTimelineRange"];
  readonly readSynchronizedMessages?: ResourceClient["readSynchronizedMessages"];
  readonly readTopicTimeBounds?: ResourceClient["readTopicTimeBounds"];
}): ResourceClient {
  return {
    cancelIdleReads,
    cancelRunwayReads,
    readDecodedMessages,
    readSynchronizedMessageBatch,
    readSynchronizedMessages,
    readTimelineRange,
    readTopicTimeBounds,
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

function createTimelineRange(endTimeNs = 1_000_000_000n): TimelineRange {
  return {
    activeTimeline: "log",
    endTimeNs,
    startTimeNs: 0n,
  };
}

function createWindow({
  messageTimeNs,
  resourceHints,
  timeNs,
  stream = STREAM,
  visualization,
}: {
  readonly messageTimeNs?: bigint;
  readonly resourceHints?: DecodeResult["output"]["resourceHints"];
  readonly timeNs: bigint;
  readonly stream?: string;
  readonly visualization: DecodedMessage["decoded"]["output"]["visualization"];
}): SynchronizedMessageWindow {
  const message = createDecodedMessage({
    timeNs: messageTimeNs ?? timeNs,
    stream,
    resourceHints,
    visualization,
  });
  return {
    activeTimeline: "log",
    endTimeNs: timeNs,
    messages: [message],
    messagesByTopic: {
      [stream]: [message],
    },
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createEmptyWindow(timeNs: bigint): SynchronizedMessageWindow {
  return {
    activeTimeline: "log",
    endTimeNs: timeNs,
    messages: [],
    messagesByTopic: {},
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createPartialDecodeWindow(timeNs: bigint): SynchronizedMessageWindow {
  const lidarMessage = createDecodedMessage({
    timeNs,
    stream: LIDAR_STREAM,
    visualization: {
      bytes: new Uint8Array([1]),
      kind: VISUALIZATION_KIND.ENCODED_IMAGE,
    },
  });
  return {
    activeTimeline: "log",
    decodeErrorsByTopic: {
      [STREAM]: [
        {
          code: "message-decode-failed",
          message: "invalid calibration",
          messageTimeNs: timeNs,
          payloadIdentity: '["cdr","ros2msg","sensor_msgs/msg/CameraInfo"]',
          requestedTimeNs: timeNs,
          topic: STREAM,
        },
      ],
    },
    endTimeNs: timeNs,
    messages: [lidarMessage],
    messagesByTopic: {
      [LIDAR_STREAM]: [lidarMessage],
      [STREAM]: [],
    },
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function createDecodedMessage({
  timeNs,
  stream = STREAM,
  resourceHints,
  visualization,
}: {
  readonly timeNs: bigint;
  readonly stream?: string;
  readonly resourceHints?: DecodeResult["output"]["resourceHints"];
  readonly visualization: DecodedMessage["decoded"]["output"]["visualization"];
}): DecodedMessage {
  return {
    activeTimeline: "log",
    channelId: 1,
    decoded: {
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: {
        resourceHints,
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
    topic: stream,
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
