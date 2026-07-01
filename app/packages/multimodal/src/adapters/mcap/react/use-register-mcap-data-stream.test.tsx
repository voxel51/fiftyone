import {
  PlaybackProvider,
  streamValueAtom,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    let playbackStore: PlaybackStore | undefined;
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
        onStore={(store) => {
          playbackStore = store;
        }}
        source={sourceA}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Harness
        client={client}
        onStore={(store) => {
          playbackStore = store;
        }}
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
    expect(playbackStore?.get(streamValueAtom(TOPIC))).toBeNull();
  });

  it("ignores in-flight batch results after topic unsubscribe", async () => {
    const source = createSource("source");
    const oldBatch = deferred<readonly McapSynchronizedMessageWindow[]>();
    let playbackStore: PlaybackStore | undefined;
    const client = createClient({
      readSynchronizedMessageBatch: vi.fn(() => oldBatch.promise),
      readTimelineRange: vi.fn(async () => createTimelineRange()),
    });

    const { rerender } = render(
      <Harness
        client={client}
        onStore={(store) => {
          playbackStore = store;
        }}
        source={source}
      />,
      { wrapper: TestProviders },
    );

    await waitFor(() => {
      expect(client.readSynchronizedMessageBatch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Harness
        client={client}
        onStore={(store) => {
          playbackStore = store;
        }}
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

    expect(playbackStore?.get(streamValueAtom(TOPIC))).toBeNull();
  });
});

function Harness({
  client,
  onStore,
  source,
  subscribe = true,
}: {
  readonly client: McapResourceClient;
  readonly onStore: (store: PlaybackStore) => void;
  readonly source: ByteSourceDescriptor | null;
  readonly subscribe?: boolean;
}) {
  const dataStream = useMcapDataStream();
  const store = usePlaybackStore();
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

function createClient({
  readSynchronizedMessageBatch,
  readTimelineRange,
}: {
  readonly readSynchronizedMessageBatch: McapResourceClient["readSynchronizedMessageBatch"];
  readonly readTimelineRange: McapResourceClient["readTimelineRange"];
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
    readSynchronizedMessages: vi.fn(),
    readTimelineRange,
    readTopics: vi.fn(async () => []),
  };
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return {
    sourceId,
    url: `memory://${sourceId}.mcap`,
  };
}

function createTimelineRange(): McapTimelineRange {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs: 1_000_000_000n,
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
