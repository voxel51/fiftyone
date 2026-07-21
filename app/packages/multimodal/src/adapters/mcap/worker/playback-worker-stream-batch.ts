import type { McapDecodedMessage } from "../shared/types";

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
export function estimateMcapStreamItemBytes(item: McapDecodedMessage): number {
  return Math.max(
    MIN_STREAM_ITEM_ESTIMATED_BYTES,
    item.encodedPayloadBytes ?? 0,
    item.decoded.output.resourceHints?.sizeBytes ?? 0,
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
