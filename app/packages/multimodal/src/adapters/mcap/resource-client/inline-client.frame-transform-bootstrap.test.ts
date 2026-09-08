import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { McapIndexedReaderLike } from "../reader/index";
import { createInlineMcapResourceClient } from "./inline-client";
import {
  CUSTOM_TRANSFORM_BUNDLE_MESSAGE,
  CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA,
  FRAME_TRANSFORMS_MESSAGE_WITHOUT_TIMESTAMP,
  FRAME_TRANSFORMS_SCHEMA_DATA,
  FRAME_TRANSFORM_MESSAGE,
  FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
  FRAME_TRANSFORM_SCHEMA_DATA,
  ROS1_TF_MESSAGE_SCHEMA,
  createBoundedReadResult,
  createChannel,
  createChunkIndex,
  createIndexedMessageTime,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createSchema,
  createStatistics,
  createTestDecodeClient,
  ros1TfMessage,
  ros1TransformStamped,
} from "./inline-client.test-fixtures";

describe("MCAP frame transform bootstrap", () => {
  it("returns an empty frame transform bootstrap when no transform-schema channels exist", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readMessages,
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set).toEqual({ samples: [] });
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("skips non-static transform topics during bootstrap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/sensor_calibration",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledOnce();
    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/sensor_calibration"],
    });
    expect(set.samples).toEqual([]);
  });

  it("bootstraps ambiguous transform topics when the first decoded message is static", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/sensor_calibration",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledTimes(2);
    expect(readMessages).toHaveBeenLastCalledWith({
      topics: ["/sensor_calibration"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.timeNs).toBeUndefined();
  });

  it("discovers static foxglove.FrameTransform channels by schema", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/robot/tf_static"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.timeNs).toBeUndefined();
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("uses bounded indexed reads for static transform bootstrap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () =>
      createBoundedReadResult([
        createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
          channelId: 10,
        }),
      ]),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          chunkIndexes: [
            createChunkIndex({
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 900n]]),
              uncompressedSize: 256n,
            }),
          ],
          readBoundedMessages,
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const source = createMcapSourceDescriptor();
    const set = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: 100n,
      source,
      startTimeNs: 100n,
    });

    expect(readMessages).not.toHaveBeenCalled();
    expect(readBoundedMessages).toHaveBeenCalledOnce();
    expect(readBoundedMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        absoluteMaxChunks: 1,
        maxChunks: 1,
        topics: ["/tf_static"],
      }),
    );
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(window.samples).toEqual([]);
  });

  it.each([
    { bounded: true, kind: "bounded" },
    { bounded: false, kind: "fallback" },
  ])(
    "keeps timestamped static-topic samples window-readable after $kind bootstrap",
    async ({ bounded }) => {
      const timeNs = 7_000_000_020n;
      const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: timeNs,
      });
      const readBoundedMessages = vi.fn(async () =>
        createBoundedReadResult([message]),
      );
      const readMessages = vi.fn(async function* () {
        yield message;
      });
      const client = createInlineMcapResourceClient({
        byteClient: { readBytes: vi.fn() },
        decodeClient: createTestDecodeClient(),
        readerFactory: vi.fn(async () =>
          createReader({
            channelsById: new Map([
              [
                10,
                createChannel({
                  id: 10,
                  schemaId: 10,
                  topic: "/tf_static",
                }),
              ],
            ]),
            chunkIndexes: bounded
              ? [
                  createChunkIndex({
                    messageIndexLength: 64n,
                    messageIndexOffsets: new Map([[10, 900n]]),
                    uncompressedSize: 256n,
                  }),
                ]
              : [],
            readBoundedMessages,
            readMessages,
            schemasById: new Map([
              [
                10,
                createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                  id: 10,
                  name: "foxglove.FrameTransform",
                }),
              ],
            ]),
            statistics: createStatistics({
              channelMessageCounts: new Map([[10, 1n]]),
            }),
          }),
        ),
      });
      const source = createMcapSourceDescriptor();

      const bootstrap = await client.readFrameTransformBootstrap({ source });
      const window = await client.readFrameTransformWindow({
        endTimeNs: timeNs,
        source,
        startTimeNs: timeNs,
      });

      expect(bootstrap.samples).toEqual([]);
      expect(window.samples).toHaveLength(1);
      expect(window.samples[0]).toMatchObject({
        childFrameId: "lidar",
        parentFrameId: "map",
        timeNs,
      });
      expect(readBoundedMessages).toHaveBeenCalledTimes(bounded ? 1 : 0);
      expect(readMessages).toHaveBeenCalledTimes(bounded ? 1 : 2);
    },
  );

  it("caps legacy fallback scans without marking the channel complete", async () => {
    const message = createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
      channelId: 10,
    });
    let bootstrapYields = 0;
    const readMessages = vi.fn(async function* (
      request: { readonly startTime?: bigint } = {},
    ) {
      if (request.startTime !== undefined) {
        yield message;
        return;
      }
      for (let index = 0; index < 257; index += 1) {
        bootstrapYields += 1;
        yield { ...message, logTime: BigInt(index) };
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });
    const source = createMcapSourceDescriptor();

    const bootstrap = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: message.logTime,
      source,
      startTimeNs: message.logTime,
    });

    expect(bootstrap.samples).toHaveLength(256);
    expect(bootstrapYields).toBe(257);
    expect(window.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledTimes(2);
  });

  it("caps ambiguous-topic classification across sibling-channel messages", async () => {
    let yielded = 0;
    const readMessages = vi.fn(async function* () {
      for (let index = 0; index < 258; index += 1) {
        yielded += 1;
        yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
          channelId: 99,
          logTime: BigInt(index),
        });
      }
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/sensor_calibration",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const bootstrap = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(bootstrap.samples).toEqual([]);
    expect(yielded).toBe(258);
    expect(readMessages).toHaveBeenCalledOnce();
  });

  it("observes cancellation while scanning legacy fallback messages", async () => {
    const controller = new AbortController();
    const message = createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
      channelId: 10,
    });
    const readMessages = vi.fn(async function* () {
      yield message;
      controller.abort();
      yield message;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    await expect(
      client.readFrameTransformBootstrap(
        { source: createMcapSourceDescriptor() },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({
      message: "MCAP frame transform bootstrap aborted",
      name: "AbortError",
    });
  });

  it("drains bounded transform bootstrap continuations without partial results", async () => {
    const continuation = {
      nextChunkStartOffset: 2_000n,
      sourceKey: "source",
      topicsKey: "/tf_static",
      version: 1 as const,
    };
    const firstMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      { channelId: 10, logTime: 100n },
    );
    const secondMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      { channelId: 10, logTime: 200n },
    );
    const readBoundedMessages = vi
      .fn<NonNullable<McapIndexedReaderLike["readBoundedMessages"]>>()
      .mockResolvedValueOnce(
        createBoundedReadResult([firstMessage], {
          continuation,
          stopReason: "budget-exhausted",
        }),
      )
      .mockResolvedValueOnce(createBoundedReadResult([secondMessage]));
    const readMessages = vi.fn(async function* () {
      yield firstMessage;
      yield secondMessage;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          chunkIndexes: [
            createChunkIndex({
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 900n]]),
              uncompressedSize: 256n,
            }),
            createChunkIndex({
              chunkStartOffset: 2_000n,
              messageEndTime: 40n,
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 1_900n]]),
              messageStartTime: 30n,
              uncompressedSize: 256n,
            }),
          ],
          readBoundedMessages,
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 2n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).not.toHaveBeenCalled();
    expect(readBoundedMessages).toHaveBeenCalledTimes(2);
    expect(readBoundedMessages.mock.calls[1]?.[0]).toMatchObject({
      continuation,
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(2);
  });

  it("defers missing-stat static channels that span more chunks than the cap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () => createBoundedReadResult([]));
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          chunkIndexes: Array.from({ length: 257 }, (_, index) =>
            createChunkIndex({
              chunkStartOffset: BigInt(1_000 + index * 1_000),
              messageEndTime: BigInt(index * 2 + 1),
              messageIndexOffsets: new Map([[10, BigInt(index * 1_000 + 900)]]),
              messageStartTime: BigInt(index * 2),
            }),
          ),
          readBoundedMessages,
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set.samples).toEqual([]);
    expect(readBoundedMessages).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("defers missing-stat static channels whose indexed messages exceed the cap", async () => {
    const controller = new AbortController();
    const readIndexedMessageTimes = vi.fn(async function* () {
      for (let index = 0; index < 257; index += 1) {
        yield createIndexedMessageTime(
          "/tf_static",
          10,
          BigInt(index),
          BigInt(index),
        );
      }
    });
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () => createBoundedReadResult([]));
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          chunkIndexes: [
            createChunkIndex({
              messageIndexOffsets: new Map([[10, 900n]]),
            }),
          ],
          readBoundedMessages,
          readIndexedMessageTimes,
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap(
      { source: createMcapSourceDescriptor() },
      { signal: controller.signal },
    );

    expect(set.samples).toEqual([]);
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      limit: 257,
      signal: controller.signal,
      topics: ["/tf_static"],
    });
    expect(readBoundedMessages).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("discovers transform-like protobuf schemas without Foxglove schema names", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(CUSTOM_TRANSFORM_BUNDLE_MESSAGE, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/static_transforms",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA, {
                id: 10,
                name: "custom.CalibrationBundle",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/static_transforms"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "custom_lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
  });

  it("includes bootstrap transform channels when summary stats are unavailable", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
  });

  it("flattens foxglove.FrameTransforms bootstrap messages and caches reads", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORMS_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORMS_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransforms",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const first = await client.readFrameTransformBootstrap({ source });
    const second = await client.readFrameTransformBootstrap({ source });

    expect(second).toBe(first);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(first.samples.map((sample) => sample.timeNs)).toEqual([
      undefined,
      undefined,
    ]);
    expect(first.samples.map((sample) => sample.childFrameId)).toEqual([
      "lidar",
      "base_link",
    ]);
    expect(first.samples.map((sample) => sample.parentFrameId)).toEqual([
      "base_link",
      "map",
    ]);
  });

  it("bootstraps ros1 /tf_static messages as whole-file static transforms", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        ros1TfMessage({
          transforms: [
            ros1TransformStamped({
              childFrameId: "base_link",
              parentFrameId: "map",
              stamp: { nsec: 20, sec: 7 },
              translation: { x: 1, y: 2, z: 3 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 10n,
        },
      );
      yield createMessage(
        ros1TfMessage({
          transforms: [
            ros1TransformStamped({
              childFrameId: "lidar",
              parentFrameId: "base_link",
              stamp: { nsec: 40, sec: 8 },
              translation: { x: 4, y: 5, z: 6 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 1_000n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "ros1",
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new TextEncoder().encode(ROS1_TF_MESSAGE_SCHEMA), {
                encoding: "ros1msg",
                id: 10,
                name: "tf2_msgs/TFMessage",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 2n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(2);
    expect(set.samples.map((sample) => sample.timeNs)).toEqual([
      undefined,
      undefined,
    ]);
    expect(set.samples.map((sample) => sample.childFrameId)).toEqual([
      "lidar",
      "base_link",
    ]);
    expect(set.samples.map((sample) => sample.parentFrameId)).toEqual([
      "base_link",
      "map",
    ]);
  });

  it("reuses fully bootstrapped static channels across transform windows", async () => {
    const staticMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      {
        channelId: 11,
        logTime: 1n,
      },
    );
    const dynamicMessage = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: 7_000_000_020n,
    });
    const readMessages = vi.fn(async function* ({
      topics,
    }: {
      readonly topics?: readonly string[];
    } = {}) {
      if (topics?.includes("/tf_static")) {
        yield staticMessage;
      }
      if (topics?.includes("/tf")) {
        yield dynamicMessage;
      }
    });
    const reader = createReader({
      channelsById: new Map([
        [
          10,
          createChannel({
            id: 10,
            schemaId: 10,
            topic: "/tf",
          }),
        ],
        [
          11,
          createChannel({
            id: 11,
            schemaId: 10,
            topic: "/tf_static",
          }),
        ],
      ]),
      readMessages,
      schemasById: new Map([
        [
          10,
          createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
            id: 10,
            name: "foxglove.FrameTransform",
          }),
        ],
      ]),
      statistics: createStatistics({
        channelMessageCounts: new Map([
          [10, 10_000n],
          [11, 1n],
        ]),
      }),
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => reader),
    });
    const source = createMcapSourceDescriptor();

    const bootstrap = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: dynamicMessage.logTime,
      source,
      startTimeNs: dynamicMessage.logTime,
    });

    expect(bootstrap.samples).toHaveLength(1);
    expect(window.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenNthCalledWith(1, {
      topics: ["/tf_static"],
    });
    expect(readMessages).toHaveBeenNthCalledWith(2, {
      endTime: dynamicMessage.logTime,
      startTime: dynamicMessage.logTime,
      topics: ["/tf"],
    });
  });

  it("keeps deferred static channels in transform windows", async () => {
    const staticMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      {
        channelId: 11,
        logTime: 7_000_000_020n,
      },
    );
    const readMessages = vi.fn(async function* () {
      yield staticMessage;
    });
    const reader = createReader({
      channelsById: new Map([
        [
          11,
          createChannel({
            id: 11,
            schemaId: 10,
            topic: "/tf_static",
          }),
        ],
      ]),
      readMessages,
      schemasById: new Map([
        [
          10,
          createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
            id: 10,
            name: "foxglove.FrameTransform",
          }),
        ],
      ]),
      statistics: createStatistics({
        channelMessageCounts: new Map([[11, 10_000n]]),
      }),
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => reader),
    });
    const source = createMcapSourceDescriptor();

    const bootstrap = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: staticMessage.logTime,
      source,
      startTimeNs: staticMessage.logTime,
    });

    expect(bootstrap.samples).toEqual([]);
    expect(window.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledExactlyOnceWith({
      endTime: staticMessage.logTime,
      startTime: staticMessage.logTime,
      topics: ["/tf_static"],
    });
  });

  it("skips channels whose schema is not a Foxglove frame transform", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/example/transforms",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new Uint8Array([9]), {
                id: 10,
                name: "example.Transform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set.samples).toEqual([]);
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("defers bootstrap scans of static channels with message counts above the cap", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 10_000n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set.samples).toEqual([]);
    expect(readMessages).not.toHaveBeenCalled();
  });
});
