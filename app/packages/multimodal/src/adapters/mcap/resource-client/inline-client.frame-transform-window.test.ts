import { describe, expect, it, vi } from "vitest";
import { isEpisodeReadCancelledError } from "../../../ports/index";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapMessage,
} from "../reader/index";
import { createInlineMcapResourceClient } from "./inline-client";
import {
  FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA,
  FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA,
  FRAME_TRANSFORM_MESSAGE,
  FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
  FRAME_TRANSFORM_SCHEMA_DATA,
  ROS1_TF_MESSAGE_SCHEMA,
  ROS2_IDL_TF_MESSAGE_SCHEMA,
  ROS2_TF_MESSAGE_SCHEMA,
  asyncGeneratorMock,
  createChannel,
  createIndexedMessageTime,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createSchema,
  createTestDecodeClient,
  foxgloveRos2FrameTransform,
  foxgloveRos2FrameTransforms,
  replaceAscii,
  ros1TfMessage,
  ros1TransformStamped,
  ros2IdlTfMessage,
  ros2IdlTransformStamped,
  ros2TfMessage,
  ros2TransformStamped,
  transformChannelsById,
  transformSchemasById,
  promiseMock,
  mockReaderFactory,
} from "./inline-client.test-fixtures";

describe("MCAP frame transform windows", () => {
  it("reads ros2 cdr TFMessage samples from dynamic frame transform windows", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(
        ros2TfMessage({
          transforms: [
            ros2TransformStamped({
              childFrameId: "base_link",
              parentFrameId: "map",
              stamp: { nanosec: 20, sec: 7 },
              translation: { x: 1, y: 2, z: 3 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 7_000_000_020n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new TextEncoder().encode(ROS2_TF_MESSAGE_SCHEMA), {
                encoding: "ros2msg",
                id: 10,
                name: "tf2_msgs/msg/TFMessage",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 7_000_000_020n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 7_000_000_020n,
    });

    expect(readMessages).toHaveBeenCalledWith({
      endTime: 7_000_000_020n,
      startTime: 7_000_000_020n,
      topics: ["/tf"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "base_link",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("reads ros2 idl TFMessage samples from dynamic frame transform windows", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(
        ros2IdlTfMessage({
          transforms: [
            ros2IdlTransformStamped({
              childFrameId: "camera",
              parentFrameId: "base_link",
              stamp: { nsec: 30, sec: 9 },
              translation: { x: 4, y: 5, z: 6 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 9_000_000_030n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(ROS2_IDL_TF_MESSAGE_SCHEMA),
                {
                  encoding: "ros2idl",
                  id: 10,
                  name: "tf2_msgs/msg/TFMessage",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 9_000_000_030n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 9_000_000_030n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "camera",
      parentFrameId: "base_link",
      timeNs: 9_000_000_030n,
    });
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
  });

  it("reads foxglove_msgs cdr FrameTransforms samples from dynamic frame transform windows", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(
        foxgloveRos2FrameTransforms({
          transforms: [
            {
              child_frame_id: "lidar",
              parent_frame_id: "map",
              rotation: { w: 1, x: 0, y: 0, z: 0 },
              timestamp: { nanosec: 40, sec: 8 },
              translation: { x: 1, y: 2, z: 3 },
            },
          ],
        }),
        {
          channelId: 10,
          logTime: 8_000_000_040n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA),
                {
                  encoding: "ros2msg",
                  id: 10,
                  name: "foxglove_msgs/msg/FrameTransforms",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 8_000_000_040n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 8_000_000_040n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 8_000_000_040n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("reads foxglove_msgs cdr FrameTransform samples from dynamic frame transform windows", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(
        foxgloveRos2FrameTransform({
          child_frame_id: "camera",
          parent_frame_id: "map",
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          timestamp: { nanosec: 50, sec: 8 },
          translation: { x: 4, y: 5, z: 6 },
        }),
        {
          channelId: 10,
          logTime: 8_000_000_050n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA),
                {
                  encoding: "ros2msg",
                  id: 10,
                  name: "foxglove_msgs/msg/FrameTransform",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 8_000_000_050n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 8_000_000_050n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "camera",
      parentFrameId: "map",
      timeNs: 8_000_000_050n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
  });

  it("skips malformed ROS TFMessage payloads without failing the window", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(new Uint8Array([1, 2, 3]), {
        channelId: 10,
        logTime: 7_000_000_020n,
      });
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
          logTime: 7_000_000_020n,
        },
      );
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                messageEncoding: "ros1",
                schemaId: 10,
                topic: "/tf",
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
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 7_000_000_020n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 7_000_000_020n,
    });

    expect(set.messageCount).toBe(2);
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "base_link",
      parentFrameId: "map",
    });
  });

  it("reads dynamic frame transform windows from any schema-discovered topic", async () => {
    const readIndexedMessageTimes = asyncGeneratorMock(function* () {
      yield createIndexedMessageTime(
        "/robot_transforms",
        10,
        7_000_000_020n,
        200n,
      );
    });
    const readMessages = asyncGeneratorMock(function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: 7_000_000_020n,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
              }),
            ],
          ]),
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

    const set = await client.readFrameTransformWindow({
      endTimeNs: 7_000_000_020n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 7_000_000_020n,
    });

    expect(readMessages).toHaveBeenCalledWith({
      endTime: 7_000_000_020n,
      startTime: 7_000_000_020n,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("materializes inclusive transform-window boundaries from exact indexed offsets", async () => {
    const startTimeNs = 7_000_000_020n;
    const endTimeNs = 8_000_000_020n;
    const startEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      startTimeNs,
      200n,
    );
    const endEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      endTimeNs,
      300n,
    );
    const entries = [
      createIndexedMessageTime("/robot_transforms", 10, startTimeNs - 1n, 100n),
      startEntry,
      endEntry,
      createIndexedMessageTime("/robot_transforms", 10, endTimeNs + 1n, 400n),
    ];
    const endPayload = FRAME_TRANSFORM_MESSAGE.slice();
    // Foxglove Timestamp.seconds is the one-byte varint at this offset in the
    // pinned fixture.
    endPayload[3] = 8;
    const messagesByTime = new Map([
      [
        startTimeNs,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: startTimeNs,
        }),
      ],
      [
        endTimeNs,
        createMessage(endPayload, { channelId: 10, logTime: endTimeNs }),
      ],
    ]);
    const readIndexedMessageTimes = asyncGeneratorMock(function* () {
      yield* entries;
    });
    const readIndexedMessages = promiseMock(
      ({
        entries: selected,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) =>
        selected.map((entry) => {
          const message = messagesByTime.get(entry.logTimeNs);
          if (!message) {
            throw new Error(`Missing test message at ${entry.logTimeNs}`);
          }
          return message;
        }),
    );
    const readMessages = asyncGeneratorMock(function* () {
      yield* [];
    });
    const prefetchChunkData = promiseMock(() => undefined);
    const prefetchWindow = promiseMock(() => undefined);
    const controller = new AbortController();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readSignal: { current: controller.signal },
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: transformChannelsById(),
          prefetchChunkData,
          prefetchWindow,
          readIndexedMessages,
          readIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs,
    });

    expect(prefetchWindow).toHaveBeenCalledExactlyOnceWith({
      endTimeNs,
      includeChunkData: false,
      startTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      endTimeNs,
      startTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [startEntry, endEntry],
      signal: controller.signal,
    });
    expect(prefetchChunkData).toHaveBeenCalledExactlyOnceWith({
      chunkStartOffsets: [1_000n],
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.messageCount).toBe(2);
    expect(set.samples.map((sample) => sample.timeNs)).toEqual([
      startTimeNs,
      endTimeNs,
    ]);
  });

  it("matches fallback semantics when header time lands inside the window", async () => {
    const startTimeNs = 10_000_000_000n;
    const endTimeNs = 11_000_000_000n;
    const logTimeNs = 10_500_000_000n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      logTimeNs,
      200n,
    );
    const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: logTimeNs,
    });
    const exactReadIndexedMessageTimes = asyncGeneratorMock(function* () {
      yield entry;
    });
    const exactReadIndexedMessages = promiseMock(() => [message]);
    const exactReadMessages = asyncGeneratorMock(function* () {
      yield* [];
    });
    const fallbackReadMessages = asyncGeneratorMock(function* () {
      yield message;
    });
    const createTransformClient = (reader: ReturnType<typeof createReader>) =>
      createInlineMcapResourceClient({
        byteClient: { readBytes: vi.fn() },
        decodeClient: createTestDecodeClient(),
        readerFactory: mockReaderFactory(() => reader),
      });
    const exact = createTransformClient(
      createReader({
        channelsById: transformChannelsById(),
        readIndexedMessages: exactReadIndexedMessages,
        readIndexedMessageTimes: exactReadIndexedMessageTimes,
        readMessages: exactReadMessages,
        schemasById: transformSchemasById(),
      }),
    );
    const fallback = createTransformClient(
      createReader({
        channelsById: transformChannelsById(),
        readMessages: fallbackReadMessages,
        schemasById: transformSchemasById(),
      }),
    );
    const request = {
      endTimeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs,
    };

    const exactSet = await exact.readFrameTransformWindow(request);
    const fallbackSet = await fallback.readFrameTransformWindow(request);

    expect(exactSet).toEqual(fallbackSet);
    expect(exactSet.samples).toHaveLength(1);
    expect(exactSet.samples[0]?.timeNs).toBe(7_000_000_020n);
    expect(exactReadMessages).not.toHaveBeenCalled();
    expect(fallbackReadMessages).toHaveBeenCalledExactlyOnceWith({
      endTime: endTimeNs,
      startTime: startTimeNs,
      topics: ["/robot_transforms"],
    });
  });

  it("materializes predecessor anchors through the same exact chunk cache", async () => {
    const anchorTimeNs = 7_000_000_020n;
    const anchor = createIndexedMessageTime(
      "/robot_transforms",
      10,
      anchorTimeNs,
      200n,
    );
    const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: anchorTimeNs,
    });
    const readIndexedMessageTimes = asyncGeneratorMock(function* () {
      yield* [];
    });
    const readLatestIndexedMessageTimes = promiseMock(
      () => new Map([["/robot_transforms", [anchor]]]),
    );
    const readIndexedMessages = promiseMock(() => [message]);
    const readMessages = asyncGeneratorMock(function* () {
      yield* [];
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 10_000_000_000n,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 32,
      timeNs: 10_000_000_000n,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [anchor],
      signal: undefined,
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]?.timeNs).toBe(anchorTimeNs);
  });

  it("expands exact placement tails until every known dynamic child is anchored", async () => {
    const timeNs = 10_000_000_000n;
    const slowPayload = replaceAscii(FRAME_TRANSFORM_MESSAGE, "lidar", "slow1");
    const fastEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      9_000_000_000n,
      200n,
    );
    const slowEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      8_000_000_000n,
      100n,
    );
    const messagesByOffset = new Map([
      [
        fastEntry.messageOffset,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: fastEntry.logTimeNs,
        }),
      ],
      [
        slowEntry.messageOffset,
        createMessage(slowPayload, {
          channelId: 10,
          logTime: slowEntry.logTimeNs,
        }),
      ],
    ]);
    const readLatestIndexedMessageTimes = promiseMock(
      ({ limitPerTopic }: { readonly limitPerTopic?: number }) =>
        new Map([
          [
            "/robot_transforms",
            limitPerTopic === 32 ? [fastEntry] : [slowEntry, fastEntry],
          ],
        ]),
    );
    const readIndexedMessages = promiseMock(
      ({
        entries,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) =>
        entries.map((entry) => {
          const message = messagesByOffset.get(entry.messageOffset);
          if (!message) {
            throw new Error(`Missing test message at ${entry.messageOffset}`);
          }
          return message;
        }),
    );
    const readMessages = asyncGeneratorMock(function* () {
      yield* [];
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar", "slow1"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenNthCalledWith(1, {
      limitPerTopic: 32,
      timeNs,
      topics: ["/robot_transforms"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenNthCalledWith(2, {
      limitPerTopic: 128,
      timeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledTimes(2);
    expect(readIndexedMessages.mock.calls[0]?.[0].entries).toEqual([fastEntry]);
    expect(readIndexedMessages.mock.calls[1]?.[0].entries).toEqual([slowEntry]);
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: slowEntry.logTimeNs,
    });
    expect(set.samples.map((sample) => sample.childFrameId).sort()).toEqual([
      "lidar",
      "slow1",
    ]);
  });

  it("settles missing children when every topic predecessor is exhausted", async () => {
    const timeNs = 10_000_000_000n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      9_000_000_000n,
      200n,
    );
    const readLatestIndexedMessageTimes = promiseMock(
      () => new Map([["/robot_transforms", [entry]]]),
    );
    const readIndexedMessages = promiseMock(() => [
      createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: entry.logTimeNs,
      }),
    ]);
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar", "missing"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(2);
    expect(readIndexedMessages).toHaveBeenCalledOnce();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: entry.logTimeNs,
    });
    expect(set.samples).toHaveLength(1);
  });

  it("bounds scoped placement coverage by every transform topic's probe floor", async () => {
    const timeNs = 10_000_000_000n;
    const sparseEntry = createIndexedMessageTime(
      "/sparse_transforms",
      10,
      5_000_000_000n,
      100n,
    );
    const busyEntry = createIndexedMessageTime(
      "/busy_transforms",
      11,
      9_900_000_000n,
      200n,
    );
    const messagesByOffset = new Map([
      [
        sparseEntry.messageOffset,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: sparseEntry.logTimeNs,
        }),
      ],
      [
        busyEntry.messageOffset,
        createMessage(replaceAscii(FRAME_TRANSFORM_MESSAGE, "lidar", "other"), {
          channelId: 11,
          logTime: busyEntry.logTimeNs,
        }),
      ],
    ]);
    const readLatestIndexedMessageTimes = promiseMock(
      () =>
        new Map([
          ["/sparse_transforms", [sparseEntry]],
          ["/busy_transforms", [busyEntry]],
        ]),
    );
    const readIndexedMessages = promiseMock(
      ({ entries }: { readonly entries: readonly McapIndexedMessageTime[] }) =>
        entries.map(
          (entry) => messagesByOffset.get(entry.messageOffset) as McapMessage,
        ),
    );
    const channelsById = new Map([
      [
        10,
        createChannel({
          id: 10,
          schemaId: 10,
          topic: "/sparse_transforms",
        }),
      ],
      [
        11,
        createChannel({
          id: 11,
          schemaId: 10,
          topic: "/busy_transforms",
        }),
      ],
    ]);
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById,
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: busyEntry.logTimeNs,
    });
  });

  it("keeps cancellation canonical after the worker advances its signal slot", async () => {
    const timeNs = 7_000_000_020n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      timeNs,
      200n,
    );
    const controller = new AbortController();
    const readSignal = { current: controller.signal as AbortSignal | null };
    const readIndexedMessageTimes = asyncGeneratorMock(function* () {
      yield entry;
    });
    const readIndexedMessages = promiseMock(() => {
      controller.abort();
      readSignal.current = new AbortController().signal;
      const error = new Error("MCAP indexed message read aborted");
      error.name = "AbortError";
      throw error;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readSignal,
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const read = client.readFrameTransformWindow({
      endTimeNs: timeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    await expect(read).rejects.toSatisfy(isEpisodeReadCancelledError);
    expect(readSignal.current?.aborted).toBe(false);
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [entry],
      signal: controller.signal,
    });
  });

  it("anchors indexed transform windows with cached predecessor messages", async () => {
    const anchorTimeNs = 7_000_000_020n;
    const earlierAnchorTimeNs = 6_000_000_020n;
    const earlierFrameTransformMessage = FRAME_TRANSFORM_MESSAGE.slice();
    // Foxglove Timestamp.seconds is the one-byte varint at this offset in the
    // pinned fixture; retain the same edge while giving it an older pose.
    earlierFrameTransformMessage[3] = 6;
    const readLatestIndexedMessageTimes = promiseMock(
      () =>
        new Map([
          [
            "/robot_transforms",
            [
              createIndexedMessageTime(
                "/robot_transforms",
                10,
                anchorTimeNs,
                20n,
              ),
              createIndexedMessageTime(
                "/robot_transforms",
                10,
                earlierAnchorTimeNs,
                10n,
              ),
            ],
          ],
        ]),
    );
    const readMessages = asyncGeneratorMock(function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }) {
      if (
        args?.startTime !== undefined &&
        args.endTime !== undefined &&
        args.startTime <= earlierAnchorTimeNs &&
        earlierAnchorTimeNs <= args.endTime
      ) {
        yield createMessage(earlierFrameTransformMessage, {
          channelId: 10,
          logTime: earlierAnchorTimeNs,
        });
      }
      if (
        args?.startTime !== undefined &&
        args.endTime !== undefined &&
        args.startTime <= anchorTimeNs &&
        anchorTimeNs <= args.endTime
      ) {
        yield createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: anchorTimeNs,
        });
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
              }),
            ],
          ]),
          readLatestIndexedMessageTimes,
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

    const first = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source,
      startTimeNs: 10_000_000_000n,
    });
    const second = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source,
      startTimeNs: 10_500_000_000n,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 32,
      timeNs: 10_000_000_000n,
      topics: ["/robot_transforms"],
    });
    expect(first.samples).toHaveLength(1);
    expect(second.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledWith({
      endTime: anchorTimeNs,
      startTime: earlierAnchorTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(first.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: anchorTimeNs,
    });
  });

  it("keeps the bounded predecessor fallback for readers without indexes", async () => {
    const readMessages = asyncGeneratorMock(function* () {
      // The message lands inside the bounded log-time read, while its recorded
      // transform timestamp precedes the window and becomes the held anchor.
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: 10_500_000_000n,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
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

    const set = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 10_000_000_000n,
    });

    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
  });

  it("keeps dynamic frame transform window reads in a bounded LRU cache", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = asyncGeneratorMock(function* () {
      for (const message of [] as McapMessage[]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf",
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

    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });
    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });

    expect(readMessages).toHaveBeenCalledTimes(1);

    for (let index = 1; index <= 32; index += 1) {
      await client.readFrameTransformWindow({
        endTimeNs: BigInt(index),
        source,
        startTimeNs: BigInt(index),
      });
    }
    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });

    expect(readMessages).toHaveBeenCalledTimes(34);
  });

  it("treats window samples without a message timestamp as static (no timeNs)", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
              }),
            ],
          ]),
          messages: [
            createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
              channelId: 10,
              logTime: 100n,
            }),
          ],
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

    const set = await client.readFrameTransformWindow({
      endTimeNs: 100n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 100n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]?.timeNs).toBeUndefined();
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
  });
});
