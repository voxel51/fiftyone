import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { DecodeClient } from "../../../../query/decoding";
import {
  isMcapBoundedReadCancelledError,
  type McapIndexedReaderLike,
} from "../../reader";
import { resolveMcapTimelineStrategy } from "../timeline";
import { readMcapBoundedMessages } from "./read-bounded-messages";

describe("readMcapBoundedMessages", () => {
  it("yields to cancellation during payload decode and reports decoded progress", async () => {
    const controller = new AbortController();
    const messages = Array.from({ length: 8 }, (_, index) =>
      message(index + 1),
    );
    const usage = {
      chunksOpened: 1,
      decompressedBytes: 1_000,
      decompressionCacheHits: 0,
      elapsedMs: 10,
      logicalSourceBytes: 500,
      logicalUncompressedBytes: 1_000,
      messagesDecoded: messages.length,
      transferredBytes: 500,
    };
    const reader: McapIndexedReaderLike = {
      channelsById: new Map([
        [
          1,
          {
            id: 1,
            messageEncoding: "fixture",
            metadata: new Map(),
            schemaId: 0,
            topic: "/history",
            type: "Channel",
          },
        ],
      ]),
      chunkIndexes: [],
      readBoundedMessages: vi.fn(async () => ({
        coverageByTopic: new Map(),
        messages,
        stopReason: "source-exhausted" as const,
        usage,
      })),
      readMessages: async function* () {
        for (const entry of messages) {
          yield entry;
        }
      },
      schemasById: new Map(),
    };
    let decodeCount = 0;
    const decodeClient: DecodeClient = {
      cachesDecodedOutput: false,
      async decode(request) {
        decodeCount += 1;
        if (decodeCount === 3) {
          controller.abort();
        }
        return {
          decoderId: "fixture",
          decoderVersion: "1",
          output: { resourceHints: { transferables: [] } },
          payload: request.payload,
        };
      },
    };

    try {
      await readMcapBoundedMessages({
        decodeClient,
        reader,
        request: {
          absoluteBudget: {
            maxMessages: 8,
            maxSourceBytes: 500,
            maxUncompressedBytes: 1_000,
            maxWallTimeMs: 100,
          },
          absoluteMaxChunks: 1,
          budget: {
            maxMessages: 8,
            maxSourceBytes: 500,
            maxUncompressedBytes: 1_000,
            maxWallTimeMs: 100,
          },
          maxChunks: 1,
          source: {
            sourceId: "fixture",
            url: "memory://fixture",
          },
          topics: ["/history"],
        },
        signal: controller.signal,
        timeline: resolveMcapTimelineStrategy(undefined),
      });
      throw new Error("expected bounded read cancellation");
    } catch (error) {
      expect(isMcapBoundedReadCancelledError(error)).toBe(true);
      if (!isMcapBoundedReadCancelledError(error)) {
        throw error;
      }
      expect(error.usage).toEqual({
        ...usage,
        messagesDecoded: 3,
      });
    }
  });
});

function message(sequence: number): McapTypes.TypedMcapRecords["Message"] {
  const time = BigInt(sequence);
  return {
    channelId: 1,
    data: new Uint8Array([sequence]),
    logTime: time,
    publishTime: time,
    sequence,
    type: "Message",
  };
}
