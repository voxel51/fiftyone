import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import { createInlineMcapResourceClient } from "./inline-client";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";
import {
  collect,
  createChunkIndex,
  createMcapSourceDescriptor,
  createReader,
  createTestDecodeClient,
} from "./inline-client.test-fixtures";

describe("MCAP reader lifecycle", () => {
  it("reads log timeline range from chunk indexes without scanning messages", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield {
        channelId: 7,
        chunkStartOffset: 10n,
        logTimeNs: 100n,
        messageOffset: 8n,
        topic: "/camera",
      };
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 250n,
              messageStartTime: 100n,
            }),
            createChunkIndex({
              messageEndTime: 450n,
              messageStartTime: 300n,
            }),
          ],
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    await expect(
      client.readTimelineRange({
        source,
      }),
    ).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 250n,
          startOffsetBytes: 1_000n,
        },
        {
          cumulativeCompressedBytes: 512,
          endTimeNs: 450n,
          startOffsetBytes: 1_000n,
        },
      ],
      endTimeNs: 450n,
      startTimeNs: 100n,
    });
    expect(readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("rejects byte reads past known source size before hitting the byte client", async () => {
    const source = createMcapSourceDescriptor();
    const readBytes = vi.fn();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async (_source, readable) => {
        await readable.read(128n, 1n);
        return createReader();
      }),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          source,
          topics: ["/topic"],
        }),
      ),
    ).rejects.toThrow("exceeds source size 128");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("retries reader initialization after a rejected reader promise", async () => {
    const readerFactory = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary init failure"))
      .mockResolvedValueOnce(
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 20n,
              messageStartTime: 10n,
            }),
          ],
        }),
      );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });
    const request = {
      source: createMcapSourceDescriptor(),
    };

    await expect(client.readTimelineRange(request)).rejects.toThrow(
      "temporary init failure",
    );
    await expect(client.readTimelineRange(request)).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 20n,
          startOffsetBytes: 1_000n,
        },
      ],
      endTimeNs: 20n,
      startTimeNs: 10n,
    });
    expect(readerFactory).toHaveBeenCalledTimes(2);
  });
});
