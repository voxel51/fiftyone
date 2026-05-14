import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { DecodeResourceClient } from "../client";
import type { DecodedOutput } from "../decoders";
import { PlaybackSyncMode } from "../schemas/v1";
import { VISUALIZATION_KIND } from "../visualization";
import { createMcapResourceClient } from "./resources";
import { MCAP_TIMESTAMP_SOURCE, type McapSourceDescriptor } from "./types";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

describe("MCAP resources", () => {
  it("decodes indexed messages through the generic decode client", async () => {
    const source = createMcapSourceDescriptor();
    const schemaData = new Uint8Array([9, 8, 7]);
    const messageBytes = new Uint8Array([1, 2, 3]);
    const message = createMessage(messageBytes);
    const decodeClient: DecodeResourceClient = {
      decode: vi.fn(async (request) => ({
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      })),
    };
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient,
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([[7, createChannel()]]),
        readMessages: async function* () {
          yield message;
        },
        schemasById: new Map([[3, createSchema(schemaData)]]),
      })),
    });

    const messages = await collect(
      client.readDecodedMessages({
        limit: 1,
        source,
        topics: ["/topic"],
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelId: 7,
      logTimeNs: 100n,
      publishTimeNs: 101n,
      sequence: 2,
      syncTimeNs: 100n,
      timestampSource: MCAP_TIMESTAMP_SOURCE.LOG_TIME,
      topic: "/topic",
    });
    expect(decodeClient.decode).toHaveBeenCalledWith({
      bytes: messageBytes,
      cache: {
        decoderOptionsKey: "timestampSource=log",
        recordId: "7:100:101:2",
        source,
        streamId: "/topic",
        timeNs: 100n,
      },
      context: {
        sourceTimestamps: {
          logTime: 100n,
          publishTime: 101n,
        },
        streamId: "/topic",
        timeRangeStartKey: "logTime",
        topic: "/topic",
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.CompressedImage",
        schemaEncoding: "protobuf",
      },
      schemaData,
    });
  });

  it("groups nearest decoded messages for synchronized playback", async () => {
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
    const decodeClient: DecodeResourceClient = {
      decode: vi.fn(async (request) => ({
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      })),
    };
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient,
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
          [8, createChannel({ id: 8, topic: "/lidar" })],
        ]),
        readMessages: async function* () {
          for (const message of messages) {
            yield message;
          }
        },
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    const window = await client.readSynchronizedMessages({
      anchorTimeNs: 100n,
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(window.messages.map((message) => message.topic)).toEqual([
      "/camera",
      "/lidar",
    ]);
    expect(window.messagesByTopic["/camera"]?.[0]?.syncTimeNs).toBe(90n);
    expect(window.messagesByTopic["/lidar"]?.[0]?.syncTimeNs).toBe(108n);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("applies playback.proto sync modes per stream", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        channelId: 7,
        logTime: 90n,
        publishTime: 91n,
      }),
      createMessage(new Uint8Array([2]), {
        channelId: 7,
        logTime: 110n,
        publishTime: 111n,
      }),
      createMessage(new Uint8Array([3]), {
        channelId: 8,
        logTime: 108n,
        publishTime: 109n,
      }),
      createMessage(new Uint8Array([4]), {
        channelId: 9,
        logTime: 100n,
        publishTime: 101n,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient,
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
          [8, createChannel({ id: 8, topic: "/lidar" })],
          [9, createChannel({ id: 9, topic: "/pose" })],
        ]),
        readMessages: async function* () {
          for (const message of messages) {
            yield message;
          }
        },
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    const window = await client.readSynchronizedMessages({
      anchorTimeNs: 100n,
      source,
      streamPolicies: {
        "/camera": {
          mode: PlaybackSyncMode.LATEST,
          toleranceBeforeNs: 20n,
        },
        "/lidar": {
          mode: PlaybackSyncMode.NEAREST,
          toleranceAfterNs: 20n,
          toleranceBeforeNs: 20n,
        },
        "/pose": {
          mode: PlaybackSyncMode.STRICT,
        },
      },
      topics: ["/camera", "/lidar", "/pose"],
    });

    expect(window.messagesByTopic["/camera"]?.[0]?.syncTimeNs).toBe(90n);
    expect(window.messagesByTopic["/lidar"]?.[0]?.syncTimeNs).toBe(108n);
    expect(window.messagesByTopic["/pose"]?.[0]?.syncTimeNs).toBe(100n);
  });

  it("rejects tolerances that do not belong to the requested sync mode", async () => {
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
        ]),
        readMessages: async function* () {
          for (const message of [] as TypedMcapRecords["Message"][]) {
            yield message;
          }
        },
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    await expect(
      client.readSynchronizedMessages({
        anchorTimeNs: 100n,
        source: createMcapSourceDescriptor(),
        streamPolicies: {
          "/camera": {
            mode: PlaybackSyncMode.LATEST,
            toleranceAfterNs: 20n,
          },
        },
        topics: ["/camera"],
      })
    ).rejects.toThrow("toleranceAfterNs");
  });

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
    const decodeClient: DecodeResourceClient = {
      decode: vi.fn(async (request) => ({
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      })),
    };
    const readMessages = vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    });
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient,
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
          [8, createChannel({ id: 8, topic: "/lidar" })],
        ]),
        readMessages,
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    const windows = await client.readSynchronizedMessageBatch({
      anchorTimeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    expect(windows[0]?.messages.map((message) => message.syncTimeNs)).toEqual([
      90n,
      108n,
    ]);
    expect(windows[1]?.messages.map((message) => message.syncTimeNs)).toEqual([
      90n,
      108n,
    ]);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("reads message-time playback batches with one decoded scan", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([90]), {
        channelId: 7,
        logTime: 90n,
        publishTime: 91n,
      }),
      createMessage(new Uint8Array([108]), {
        channelId: 8,
        logTime: 108n,
        publishTime: 109n,
      }),
      createMessage(new Uint8Array([130]), {
        channelId: 7,
        logTime: 130n,
        publishTime: 131n,
      }),
    ];
    const decodeClient: DecodeResourceClient = {
      decode: vi.fn(async (request) => ({
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput({
          timing: {
            sourceTimestamps: {
              messageTime: BigInt(request.bytes[0] ?? 0),
            },
          },
        }),
        payload: request.payload,
      })),
    };
    const readMessages = vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    });
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient,
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
          [8, createChannel({ id: 8, topic: "/lidar" })],
        ]),
        readMessages,
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    const windows = await client.readSynchronizedMessageBatch({
      anchorTimeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      timestampSource: MCAP_TIMESTAMP_SOURCE.HEADER_TIME,
      topics: ["/camera", "/lidar"],
    });

    expect(windows.map((window) => window.messages.length)).toEqual([2, 2]);
    expect(windows[0]?.messages.map((message) => message.syncTimeNs)).toEqual([
      90n,
      108n,
    ]);
    expect(windows[1]?.messages.map((message) => message.syncTimeNs)).toEqual([
      90n,
      108n,
    ]);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(decodeClient.decode).toHaveBeenCalledTimes(3);
  });

  it("reads sorted timeline anchors and honors the requested limit", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([3]), { logTime: 300n }),
      createMessage(new Uint8Array([1]), { logTime: 100n }),
      createMessage(new Uint8Array([2]), { logTime: 200n }),
    ];
    const readMessages = vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    });
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
        ]),
        readMessages,
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    await expect(
      client.readTimelineAnchors({
        limit: 2,
        source,
        topic: "/camera",
      })
    ).resolves.toEqual([100n, 300n]);
    expect(readMessages).toHaveBeenCalledWith({
      endTime: undefined,
      startTime: undefined,
      topics: ["/camera"],
    });
  });

  it("uses indexed bounds for log-time timeline anchors only", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      for (const message of [] as TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => ({
        channelsById: new Map([
          [7, createChannel({ id: 7, topic: "/camera" })],
        ]),
        readMessages,
        schemasById: new Map([[3, createSchema(new Uint8Array([9]))]]),
      })),
    });

    await client.readTimelineAnchors({
      endTimeNs: 20n,
      source,
      startTimeNs: 10n,
      topic: "/camera",
    });
    expect(readMessages).toHaveBeenLastCalledWith({
      endTime: 20n,
      startTime: 10n,
      topics: ["/camera"],
    });

    await client.readTimelineAnchors({
      endTimeNs: 20n,
      source,
      startTimeNs: 10n,
      timestampSource: MCAP_TIMESTAMP_SOURCE.PUBLISH_TIME,
      topic: "/camera",
    });
    expect(readMessages).toHaveBeenLastCalledWith({
      endTime: undefined,
      startTime: undefined,
      topics: ["/camera"],
    });
  });

  it("rejects byte reads past known source size before hitting the byte client", async () => {
    const source = createMcapSourceDescriptor();
    const readBytes = vi.fn();
    const client = createMcapResourceClient({
      byteClient: {
        readBytes,
      },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async (_source, readable) => {
        await readable.read(128n, 1n);
        return {
          channelsById: new Map(),
          readMessages: async function* () {
            for (const message of [] as TypedMcapRecords["Message"][]) {
              yield message;
            }
          },
          schemasById: new Map(),
        };
      }),
    });

    await expect(
      collect(
        client.readMessageTimes({
          source,
          topics: ["/topic"],
        })
      )
    ).rejects.toThrow("exceeds source size 128");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("retries reader initialization after a rejected reader promise", async () => {
    const readerFactory = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary init failure"))
      .mockResolvedValueOnce({
        channelsById: new Map(),
        readMessages: async function* () {
          for (const message of [] as TypedMcapRecords["Message"][]) {
            yield message;
          }
        },
        schemasById: new Map(),
      });
    const client = createMcapResourceClient({
      byteClient: {
        readBytes: vi.fn(),
      },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });
    const request = {
      limit: 1,
      source: createMcapSourceDescriptor(),
      topic: "/camera",
    };

    await expect(client.readTimelineAnchors(request)).rejects.toThrow(
      "temporary init failure"
    );
    await expect(client.readTimelineAnchors(request)).resolves.toEqual([]);
    expect(readerFactory).toHaveBeenCalledTimes(2);
  });
});

async function collect<T>(
  generator: AsyncGenerator<T, void, void>
): Promise<readonly T[]> {
  const messages: T[] = [];
  for await (const message of generator) {
    messages.push(message);
  }

  return messages;
}

function createMcapSourceDescriptor(): McapSourceDescriptor {
  return {
    sizeBytes: "128",
    sourceId: "source:1",
    url: "/media?filepath=%2Ftmp%2Fsample.mcap",
  };
}

function createTestDecodeClient(): DecodeResourceClient {
  return {
    decode: vi.fn(async (request) => ({
      context: request.context,
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: createTestDecodedOutput(),
      payload: request.payload,
    })),
  };
}

function createTestDecodedOutput(
  overrides: Partial<DecodedOutput> = {}
): DecodedOutput {
  return {
    attributes: {},
    visualization: {
      bytes: new Uint8Array([5]),
      kind: VISUALIZATION_KIND.ENCODED_IMAGE,
    },
    ...overrides,
  };
}

function createChannel(
  options: Partial<TypedMcapRecords["Channel"]> = {}
): TypedMcapRecords["Channel"] {
  return {
    id: options.id ?? 7,
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: 3,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}

function createSchema(data: Uint8Array): TypedMcapRecords["Schema"] {
  return {
    data,
    encoding: "protobuf",
    id: 3,
    name: "foxglove.CompressedImage",
    type: "Schema",
  };
}

function createMessage(
  data: Uint8Array,
  options: Partial<TypedMcapRecords["Message"]> = {}
): TypedMcapRecords["Message"] {
  return {
    channelId: options.channelId ?? 7,
    data,
    logTime: options.logTime ?? 100n,
    publishTime: options.publishTime ?? 101n,
    sequence: options.sequence ?? 2,
    type: "Message",
  };
}
