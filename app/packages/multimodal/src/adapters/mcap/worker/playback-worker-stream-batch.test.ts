import { describe, expect, it } from "vitest";
import type { McapDecodedMessage } from "../contracts/index";
import {
  estimateMcapStreamItemBytes,
  isMcapStreamBatchFull,
  MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES,
  MCAP_STREAM_BATCH_MAX_ITEMS,
  wouldOverflowMcapStreamBatch,
} from "./playback-worker-stream-batch";

describe("MCAP worker stream batching", () => {
  it("uses the larger of encoded and decoded size hints", () => {
    expect(estimateMcapStreamItemBytes(message(300, 500))).toBe(500);
    expect(estimateMcapStreamItemBytes(message(600, 500))).toBe(600);
    expect(estimateMcapStreamItemBytes(message())).toBe(256);
  });

  it("flushes before an item would cross the byte cap", () => {
    expect(
      wouldOverflowMcapStreamBatch({
        batchBytes: MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES - 100,
        batchItems: 3,
        nextItemBytes: 101,
      }),
    ).toBe(true);
    expect(
      wouldOverflowMcapStreamBatch({
        batchBytes: 0,
        batchItems: 0,
        nextItemBytes: MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES + 1,
      }),
    ).toBe(false);
  });

  it("flushes a full count batch and an oversized single-item batch", () => {
    expect(
      isMcapStreamBatchFull({
        batchBytes: 1,
        batchItems: MCAP_STREAM_BATCH_MAX_ITEMS,
      }),
    ).toBe(true);
    expect(
      isMcapStreamBatchFull({
        batchBytes: MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES + 1,
        batchItems: 1,
      }),
    ).toBe(true);
  });
});

function message(
  encodedPayloadBytes?: number,
  decodedSizeBytes?: number,
): McapDecodedMessage {
  return {
    activeTimeline: "log",
    channelId: 1,
    decoded: {
      decoderId: "decoder",
      decoderVersion: "1",
      output: {
        resourceHints:
          decodedSizeBytes === undefined
            ? undefined
            : { sizeBytes: decodedSizeBytes },
      },
      payload: { encoding: "json" },
    },
    encodedPayloadBytes,
    logTimeNs: 1n,
    publishTimeNs: 1n,
    sequence: 1,
    timelineTimeNs: 1n,
    topic: "/logs",
  };
}
