import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { DecodeClient } from "../../../../query/decoding";
import {
  isMcapBoundedReadCancelledError,
  type McapIndexedReaderLike,
  type McapReadContinuation,
} from "../../reader";
import { resolveMcapTimelineStrategy } from "../timeline";
import { readMcapBoundedMessages } from "./read-bounded-messages";

describe("readMcapBoundedMessages", () => {
  it("keeps supported messages and charges a grant containing unsupported channels", async () => {
    const usage = {
      chunksOpened: 1,
      decompressedBytes: 1_000,
      decompressionCacheHits: 0,
      elapsedMs: 10,
      logicalSourceBytes: 500,
      logicalUncompressedBytes: 1_000,
      messagesDecoded: 3,
      transferredBytes: 500,
    };
    const continuation: McapReadContinuation = {
      nextChunkStartOffset: 500n,
      sourceKey: "fixture",
      topicsKey: "/supported,/unsupported",
      version: 1,
    };
    const skipped = [{ startNs: 0n, endNs: 0n }];
    const reader: McapIndexedReaderLike = {
      channelsById: new Map(
        [1, 2].map((id) => [
          id,
          {
            id,
            messageEncoding: id === 1 ? "json" : "unsupported",
            metadata: new Map(),
            schemaId: 0,
            topic: id === 1 ? "/supported" : "/unsupported",
            type: "Channel" as const,
          },
        ]),
      ),
      chunkIndexes: [],
      schemasById: new Map(),
      readMessages: async function* () {
        yield* [];
      },
      readBoundedMessages: vi.fn(async () => ({
        continuation,
        coverageByTopic: new Map([
          ["/supported", [{ startNs: 1n, endNs: 3n }]],
          ["/unsupported", [{ startNs: 1n, endNs: 3n }]],
        ]),
        messages: [
          { ...message(1), data: new TextEncoder().encode('{"value":1}') },
          { ...message(2), channelId: 2 },
          { ...message(3), data: new TextEncoder().encode('{"value":3}') },
        ],
        skippedByTopic: new Map([["/unsupported", skipped]]),
        stopReason: "budget-exhausted" as const,
        usage,
      })),
    };
    const decodeClient: DecodeClient = {
      cachesDecodedOutput: false,
      decode: vi.fn(),
    };
    const budget = {
      maxMessages: 3,
      maxSourceBytes: 500,
      maxUncompressedBytes: 1_000,
      maxWallTimeMs: 100,
    };
    const result = await readMcapBoundedMessages({
      decodeClient,
      reader,
      request: {
        absoluteBudget: budget,
        absoluteMaxChunks: 1,
        budget,
        maxChunks: 1,
        representation: "message",
        source: { sourceId: "fixture", url: "memory://fixture" },
        topics: ["/supported", "/unsupported"],
      },
      timeline: resolveMcapTimelineStrategy(undefined),
    });

    expect(result.messages.map((entry) => entry.decoded.output)).toEqual([
      { message: { value: 1 } },
      { message: { value: 3 } },
    ]);
    expect(result.unavailableByTopic?.get("/unsupported")).toEqual([
      { startNs: 0n, endNs: 0n },
      { startNs: 2n, endNs: 2n },
    ]);
    expect(skipped).toEqual([{ startNs: 0n, endNs: 0n }]);
    expect(result.usage).toEqual({ ...usage, messagesDecoded: 2 });
    expect(result.continuation).toBe(continuation);
    expect(result.stopReason).toBe("budget-exhausted");
  });

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
