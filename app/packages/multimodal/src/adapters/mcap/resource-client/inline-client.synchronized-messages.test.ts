import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import { PlaybackSyncMode } from "../../../schemas/v1/index";
import type { McapIndexedReaderLike } from "../reader/index";
import { createInlineMcapResourceClient } from "./inline-client";
import {
  createChannel,
  createIndexedMessageTime,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createTestDecodeClient,
  createTestDecodedOutput,
} from "./inline-client.test-fixtures";

describe("MCAP synchronized messages", () => {
  it("reads synchronized playback batches with one raw scan and shared decode work", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        channelId: 7,
        logTime: 90n,
        publishTime: 91n,
      }),
      createMessage(new Uint8Array([2]), {
        channelId: 8,
        logTime: 108n,
        publishTime: 109n,
      }),
      createMessage(new Uint8Array([3]), {
        channelId: 7,
        logTime: 130n,
        publishTime: 131n,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    const readMessages = vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows[0]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("orders equal-time synchronized messages by topic", async () => {
    const messages = [
      createMessage(new Uint8Array([1]), {
        channelId: 7,
        logTime: 100n,
        publishTime: 101n,
      }),
      createMessage(new Uint8Array([2]), {
        channelId: 8,
        logTime: 100n,
        publishTime: 101n,
      }),
    ];
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          messages,
        }),
      ),
    });

    const [window] = await client.readSynchronizedMessageBatch({
      source: createMcapSourceDescriptor(),
      timeNs: [100n],
      topics: ["/lidar", "/camera"],
    });

    expect(window.messages.map((message) => message.topic)).toEqual([
      "/camera",
      "/lidar",
    ]);
  });

  it.each([
    ["forward", ["/camera", "/lidar"]],
    ["reverse", ["/lidar", "/camera"]],
  ] as const)(
    "settles every topic from one union read independent of %s request order",
    async (_direction, topics) => {
      const messages = [
        createMessage(new Uint8Array(100), {
          channelId: 7,
          logTime: 100n,
          publishTime: 101n,
        }),
        createMessage(new Uint8Array(10), {
          channelId: 8,
          logTime: 100n,
          publishTime: 101n,
        }),
      ];
      const readMessages = vi.fn(async function* () {
        for (const message of messages) yield message;
      });
      const client = createInlineMcapResourceClient({
        byteClient: { readBytes: vi.fn() },
        decodeClient: createTestDecodeClient(),
        readerFactory: vi.fn(async () =>
          createReader({
            channelsById: new Map([
              [7, createChannel({ id: 7, topic: "/camera" })],
              [8, createChannel({ id: 8, topic: "/lidar" })],
            ]),
            readMessages,
          }),
        ),
      });
      const settlements: string[] = [];

      const window = await client.readSynchronizedMessages(
        {
          settlementPriorityTopics: ["/camera", "/lidar"],
          source: createMcapSourceDescriptor(),
          timeNs: 100n,
          topics,
        },
        {
          onTopicSettlement: ({ topic, window: settledWindow }) => {
            settlements.push(topic);
            expect(Object.keys(settledWindow.messagesByTopic)).toEqual([topic]);
          },
        },
      );

      expect(settlements).toEqual(["/lidar", "/camera"]);
      expect(Object.keys(window.messagesByTopic).sort()).toEqual([
        "/camera",
        "/lidar",
      ]);
      expect(readMessages).toHaveBeenCalledOnce();
    },
  );

  it("contains payload decode failures to their topic and preserves shared decode work", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        channelId: 7,
        logTime: 90n,
        publishTime: 91n,
      }),
      createMessage(new Uint8Array([2]), {
        channelId: 8,
        logTime: 108n,
        publishTime: 109n,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    vi.mocked(decodeClient.decode).mockImplementation(async (request) => {
      if (request.context.streamId === "/camera") {
        throw new Error("invalid camera calibration");
      }
      return {
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      };
    });
    const readMessages = vi.fn(async function* () {
      for (const message of messages) yield message;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    for (const window of windows) {
      expect(window.messagesByTopic["/camera"]).toEqual([]);
      expect(window.decodeErrorsByTopic?.["/camera"]).toEqual([
        expect.objectContaining({
          code: "message-decode-failed",
          message: "invalid camera calibration",
          messageTimeNs: 90n,
          requestedTimeNs: window.timeNs,
          topic: "/camera",
        }),
      ]);
      expect(window.messagesByTopic["/lidar"]).toHaveLength(1);
      expect(window.messages.map((message) => message.topic)).toEqual([
        "/lidar",
      ]);
    }
    expect(readMessages).toHaveBeenCalledTimes(1);
    // The selected union is still decoded once per unique message, including
    // the cached rejected promise reused by the second window.
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("keeps synchronized decode cache entries distinct for changed payloads", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        logTime: 100n,
        publishTime: 101n,
        sequence: 2,
      }),
      createMessage(new Uint8Array([2]), {
        logTime: 100n,
        publishTime: 101n,
        sequence: 2,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      defaultStreamPolicy: {
        limit: 2,
        mode: PlaybackSyncMode.STRICT,
      },
      topics: ["/topic"],
    });

    expect(windows[0]?.messages).toHaveLength(2);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
    const rawRecordIds = vi
      .mocked(decodeClient.decode)
      .mock.calls.map(([request]) => request.cache?.recordId);
    expect(rawRecordIds).toEqual([
      expect.stringMatching(/^7:100:101:2:1:[0-9a-f]{8}$/),
      expect.stringMatching(/^7:100:101:2:1:[0-9a-f]{8}$/),
    ]);
    expect(rawRecordIds[0]).not.toBe(rawRecordIds[1]);
  });

  it("shares synchronized worker decodes without inspecting payload bytes", async () => {
    const source = createMcapSourceDescriptor();
    const data = new Uint8Array([1, 2, 3]);
    const iteratePayload = vi.spyOn(data, Symbol.iterator);
    const message = createMessage(data, {
      logTime: 100n,
      publishTime: 101n,
    });
    const decodeClient = {
      ...createTestDecodeClient(),
      cachesDecodedOutput: false,
    };
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages: [message],
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 101n],
      source,
      topics: ["/topic"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows.map((window) => window.messagesByTopic["/topic"]?.length),
    ).toEqual([1, 1]);
    expect(decodeClient.decode).toHaveBeenCalledTimes(1);
    expect(iteratePayload).not.toHaveBeenCalled();
  });

  it("uses indexed message times to read only selected synchronized messages", async () => {
    const source = createMcapSourceDescriptor();
    const cameraBytes = new Uint8Array([1]);
    const cameraPayloadIteration = vi.spyOn(cameraBytes, Symbol.iterator);
    const camera = createMessage(cameraBytes, {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const lidar = createMessage(new Uint8Array([2]), {
      channelId: 8,
      logTime: 108n,
      publishTime: 109n,
    });
    const lateCamera = createMessage(new Uint8Array([3]), {
      channelId: 7,
      logTime: 130n,
      publishTime: 131n,
    });
    const decodeClient = createTestDecodeClient();
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/camera", 7, 90n, 900n);
      yield createIndexedMessageTime("/lidar", 8, 108n, 1080n);
      yield createIndexedMessageTime("/camera", 7, 130n, 1300n);
    });
    const messagesByTime = new Map([
      [90n, camera],
      [108n, lidar],
      [130n, lateCamera],
    ]);
    const readIndexedMessages = vi.fn(
      async ({
        entries,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) => {
        return entries.map((entry) => {
          const message = messagesByTime.get(entry.logTimeNs);
          if (!message) {
            throw new Error(`Missing test message at ${entry.logTimeNs}`);
          }
          return message;
        });
      },
    );
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const controller = new AbortController();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readSignal: { current: controller.signal },
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readIndexedMessages,
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows[0]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 125n,
      startTimeNs: 80n,
      topics: ["/camera", "/lidar"],
    });
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [
        createIndexedMessageTime("/camera", 7, 90n, 900n),
        createIndexedMessageTime("/lidar", 8, 108n, 1080n),
      ],
      signal: controller.signal,
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
    expect(decodeClient.decode).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        cache: expect.objectContaining({
          decoderOptionsKey: "activeTimeline=log",
          recordId: "/camera\u00007\u000090\u00001000\u0000900",
          streamId: "/camera",
          timeNs: 90n,
        }),
      }),
    );
    expect(cameraPayloadIteration).not.toHaveBeenCalled();
  });

  it("keeps the indexed synchronized-read fallback for readers without exact lookup", async () => {
    const message = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
    });
    const readMessages = vi.fn(async function* () {
      yield message;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const [window] = await client.readSynchronizedMessageBatch({
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      source: createMcapSourceDescriptor(),
      timeNs: [100n],
      topics: ["/topic"],
    });

    expect(window.messagesByTopic["/topic"]).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledWith({
      endTime: 90n,
      startTime: 90n,
      topics: ["/topic"],
    });
  });

  it("reuses an indexed decoded record with a per-request signal", async () => {
    const indexed = createIndexedMessageTime("/topic", 7, 90n, 900n);
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield indexed;
    });
    const readIndexedMessages = vi.fn(async () => {
      throw new Error("retained records must not materialize their chunk");
    });
    const prefetchChunkData = vi.fn(async () => undefined);
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          prefetchChunkData,
          readIndexedMessages,
          readIndexedMessageTimes,
        }),
      ),
    });
    const reuse = vi.fn(
      (identity: {
        readonly recordId: string;
        readonly timelineTimeNs: bigint;
        readonly topic: string;
      }) => ({ kind: "retained" as const, ...identity }),
    );

    const controller = new AbortController();
    const window = await client.readSynchronizedMessagesWithReuse(
      {
        defaultStreamPolicy: {
          mode: PlaybackSyncMode.NEAREST,
          toleranceAfterNs: 20n,
          toleranceBeforeNs: 20n,
        },
        pointCloudColorByByTopic: { "/topic": "intensity" },
        source: createMcapSourceDescriptor(),
        timeNs: 100n,
        topics: ["/topic"],
      },
      reuse,
      undefined,
      { signal: controller.signal },
    );

    expect(window.messages[0]).toMatchObject({
      kind: "retained",
      recordId:
        "/topic\u00007\u000090\u00001000\u0000900\u0000activeTimeline=log\u0000intensity",
      timelineTimeNs: 90n,
      topic: "/topic",
    });
    expect(reuse).toHaveBeenCalledTimes(1);
    expect(prefetchChunkData).not.toHaveBeenCalled();
    expect(readIndexedMessages).not.toHaveBeenCalled();
    expect(decodeClient.decode).not.toHaveBeenCalled();
  });

  it("serves sparse topics from one bounded scan plus one predecessor probe", async () => {
    const source = createMcapSourceDescriptor();
    const old = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 0n,
      publishTime: 1n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Nothing in the scan window — the topic is sparse around the batch.
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      return new Map([
        ["/topic", [createIndexedMessageTime("/topic", 7, 0n, 0n)]],
      ]);
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 0n && args?.endTime === 0n) {
        yield old;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_000n, 5_033n],
      source,
      topics: ["/topic"],
    });

    // Both ticks resolve the far-past predecessor under the default
    // unbounded-latest policy.
    expect(windows).toHaveLength(2);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(0n);
    expect(windows[1]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(0n);

    // The scan stays bounded by the batch tick span — never the file.
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 5_033n,
      startTimeNs: 5_000n,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 1,
      timeNs: 5_000n,
      topics: ["/topic"],
    });
  });

  it("backfills enough indexed predecessors to satisfy latest limits", async () => {
    const source = createMcapSourceDescriptor();
    const older = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 80n,
      publishTime: 81n,
    });
    const newer = createMessage(new Uint8Array([2]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      return new Map([
        [
          "/topic",
          [
            createIndexedMessageTime("/topic", 7, 90n, 900n),
            createIndexedMessageTime("/topic", 7, 80n, 800n),
          ],
        ],
      ]);
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 80n && args?.endTime === 80n) {
        yield older;
      }
      if (args?.startTime === 90n && args?.endTime === 90n) {
        yield newer;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      streamPolicies: {
        "/topic": {
          limit: 2,
          mode: PlaybackSyncMode.LATEST,
        },
      },
      topics: ["/topic"],
    });

    expect(
      windows[0]?.messagesByTopic["/topic"]?.map(
        (message) => message.timelineTimeNs,
      ),
    ).toEqual([80n, 90n]);
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 2,
      timeNs: 100n,
      topics: ["/topic"],
    });
  });

  it("memoizes predecessor lookups across batches and re-probes on backward seeks", async () => {
    const source = createMcapSourceDescriptor();
    const message = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 4_000n,
      publishTime: 4_001n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Every scan window misses the lone message at 4_000n.
    });
    const readLatestIndexedMessageTimes = vi.fn(
      async (args: { readonly timeNs: bigint }) => {
        return new Map([
          [
            "/topic",
            args.timeNs >= 4_000n
              ? [createIndexedMessageTime("/topic", 7, 4_000n, 0n)]
              : [],
          ],
        ]);
      },
    );
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 4_000n && args?.endTime === 4_000n) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    // First batch probes once and memoizes the resolution.
    await client.readSynchronizedMessageBatch({
      timeNs: [5_000n, 5_033n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);

    // Overlapping later batch: memo hit, and its empty scan extends the
    // memo's validity through 6_000n.
    await client.readSynchronizedMessageBatch({
      timeNs: [5_010n, 6_000n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);

    // Within the extended interval: still no probe.
    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_900n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(
      4_000n,
    );

    // Backward seek before the memoized predecessor: fresh probe.
    const earlier = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(2);
    expect(readLatestIndexedMessageTimes).toHaveBeenLastCalledWith({
      limitPerTopic: 1,
      timeNs: 100n,
      topics: ["/topic"],
    });
    expect(earlier[0]?.messagesByTopic["/topic"]).toEqual([]);
  });

  it("skips the predecessor probe when another topic's tolerance already covers it", async () => {
    const source = createMcapSourceDescriptor();
    const camera = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/camera", 7, 90n, 900n);
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => new Map());
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 90n && args?.endTime === 90n) {
        yield camera;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      streamPolicies: {
        "/lidar": {
          mode: PlaybackSyncMode.NEAREST,
          toleranceAfterNs: 0n,
          toleranceBeforeNs: 20n,
        },
      },
      topics: ["/camera", "/lidar"],
    });

    // The lidar tolerance widened the shared scan to [80, 100], which
    // already contains the camera predecessor — no probe needed.
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 100n,
      startTimeNs: 80n,
      topics: ["/camera", "/lidar"],
    });
    expect(readLatestIndexedMessageTimes).not.toHaveBeenCalled();
    expect(windows[0]?.messagesByTopic["/camera"]?.[0]?.timelineTimeNs).toBe(
      90n,
    );
  });

  it("surfaces predecessor probe failures as batch failures", async () => {
    const source = createMcapSourceDescriptor();
    const readIndexedMessageTimes = vi.fn(async function* () {
      // empty scan forces the probe
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      throw new Error("index read failed");
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
        }),
      ),
    });

    await expect(
      client.readSynchronizedMessageBatch({
        timeNs: [5_000n],
        source,
        topics: ["/topic"],
      }),
    ).rejects.toThrow("index read failed");
  });

  it("falls back to a bounded raw lookback for readers without indexes", async () => {
    const source = createMcapSourceDescriptor();
    const old = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 1_000n,
      publishTime: 1_001n,
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (
        args?.startTime !== undefined &&
        args?.endTime !== undefined &&
        old.logTime >= args.startTime &&
        old.logTime <= args.endTime
      ) {
        yield old;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => createReader({ readMessages })),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_000n],
      source,
      topics: ["/topic"],
    });

    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(
      1_000n,
    );
    // One bounded scan plus one bounded lookback — clamped at 0, never
    // the whole file beyond the documented lookback.
    expect(readMessages.mock.calls.map(([args]) => args)).toEqual([
      { endTime: 5_000n, startTime: 5_000n, topics: ["/topic"] },
      { endTime: 5_000n, startTime: 0n, topics: ["/topic"] },
    ]);
  });

  it("resolves duplicate same-time messages to one deterministic frame", async () => {
    // Real recordings can carry multiple messages on one channel at
    // the same log time. The whole batch used to reject on the
    // ambiguity, permanently failing every topic it covered.
    const source = createMcapSourceDescriptor();
    const first = createMessage(new Uint8Array([1]), {
      logTime: 90n,
      publishTime: 91n,
      sequence: 1,
    });
    const second = createMessage(new Uint8Array([2]), {
      logTime: 90n,
      publishTime: 92n,
      sequence: 2,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Duplicate index entries for the duplicate messages.
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
      yield createIndexedMessageTime("/topic", 7, 90n, 901n);
    });
    const readMessages = vi.fn(async function* () {
      yield first;
      yield second;
    });
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [90n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.STRICT,
      },
      topics: ["/topic"],
    });

    // One frame, deterministically the lowest-sequence duplicate, and
    // one decode — the duplicate index entry collapsed at collection.
    expect(windows[0]?.messagesByTopic["/topic"]).toHaveLength(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.sequence).toBe(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.publishTimeNs).toBe(91n);
    expect(decodeClient.decode).toHaveBeenCalledTimes(1);
  });

  it("returns empty synchronized batches without opening a reader", async () => {
    const readerFactory = vi.fn();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });

    await expect(
      client.readSynchronizedMessageBatch({
        source: createMcapSourceDescriptor(),
        timeNs: [],
        topics: ["/camera"],
      }),
    ).resolves.toEqual([]);
    expect(readerFactory).not.toHaveBeenCalled();
  });
});
