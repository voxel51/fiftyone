import type { McapDecodedMessage } from "../contracts/index";
import { messagesFromMcapWorkerResult } from "./worker-result-traversal";

/** Maximum plain decoded records delivered in one worker message. */
export const MCAP_STREAM_BATCH_MAX_ITEMS = 64;

/** Maximum estimated structured-clone bytes delivered in one worker message. */
export const MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES = 1024 ** 2;

const MIN_STREAM_ITEM_ESTIMATED_BYTES = 256;

/**
 * Cheap structured-clone size proxy for streamed decoded messages. Encoded
 * payload size covers generic log records; decoder hints cover outputs that
 * expand materially during decoding.
 */
export function estimateMcapStreamItemBytes(item: unknown): number {
  const messages = messagesFromMcapWorkerResult(item, isMcapDecodedMessage);
  if (messages.length === 0) return MIN_STREAM_ITEM_ESTIMATED_BYTES;
  return Math.max(
    MIN_STREAM_ITEM_ESTIMATED_BYTES,
    messages.reduce(
      (total, message) =>
        total +
        Math.max(
          message.encodedPayloadBytes ?? 0,
          message.decoded.output.resourceHints?.sizeBytes ?? 0,
        ),
      0,
    ),
  );
}

function isMcapDecodedMessage(item: unknown): item is McapDecodedMessage {
  return (
    typeof item === "object" &&
    item !== null &&
    "decoded" in item &&
    typeof item.decoded === "object" &&
    item.decoded !== null &&
    "output" in item.decoded
  );
}

/** Returns whether adding an item would overflow a non-empty batch. */
export function wouldOverflowMcapStreamBatch({
  batchBytes,
  batchItems,
  nextItemBytes,
}: {
  readonly batchBytes: number;
  readonly batchItems: number;
  readonly nextItemBytes: number;
}): boolean {
  return (
    batchItems > 0 &&
    batchBytes + nextItemBytes > MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES
  );
}

/** Returns whether the current batch has reached either delivery bound. */
export function isMcapStreamBatchFull({
  batchBytes,
  batchItems,
}: {
  readonly batchBytes: number;
  readonly batchItems: number;
}): boolean {
  return (
    batchItems >= MCAP_STREAM_BATCH_MAX_ITEMS ||
    batchBytes >= MCAP_STREAM_BATCH_MAX_ESTIMATED_BYTES
  );
}
