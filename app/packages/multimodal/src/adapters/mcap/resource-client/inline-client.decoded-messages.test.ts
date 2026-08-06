import { describe, expect, it, vi } from "vitest";
import { createInlineMcapResourceClient } from "./inline-client";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";
import {
  collect,
  createChannel,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createSchema,
  createTestDecodeClient,
} from "./inline-client.test-fixtures";

describe("MCAP decoded messages", () => {
  it("decodes log-timeline messages through the generic decode client", async () => {
    const source = createMcapSourceDescriptor();
    const schemaData = new Uint8Array([9, 8, 7]);
    const messageBytes = new Uint8Array([1, 2, 3]);
    const message = createMessage(messageBytes);
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([[7, createChannel()]]),
          messages: [message],
          schemasById: new Map([[3, createSchema(schemaData)]]),
        }),
      ),
    });

    const messages = await collect(
      client.readDecodedMessages({
        limit: 1,
        source,
        topics: ["/topic"],
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      channelId: 7,
      logTimeNs: 100n,
      publishTimeNs: 101n,
      sequence: 2,
      timelineTimeNs: 100n,
      topic: "/topic",
    });
    expect(decodeClient.decode).toHaveBeenCalledWith({
      bytes: messageBytes,
      cache: {
        decoderOptionsKey: "activeTimeline=log",
        recordId: expect.stringMatching(/^7:100:101:2:3:[0-9a-f]{8}$/),
        source,
        streamId: "/topic",
        timeNs: 100n,
      },
      context: {
        schemaData,
        sourceTimestamps: {
          logTime: 100n,
          publishTime: 101n,
        },
        streamId: "/topic",
        timeRangeStartKey: "logTime",
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.CompressedImage",
        schemaEncoding: "protobuf",
      },
    });
  });

  it("does not decode messages when the decoded-message limit is invalid", async () => {
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages: [createMessage(new Uint8Array([1]))],
        }),
      ),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          limit: 0,
          source: createMcapSourceDescriptor(),
          topics: ["/topic"],
        }),
      ),
    ).resolves.toEqual([]);
    expect(decodeClient.decode).not.toHaveBeenCalled();
  });
});
