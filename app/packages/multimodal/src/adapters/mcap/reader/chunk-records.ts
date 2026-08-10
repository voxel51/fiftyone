import { crc32 } from "@foxglove/crc";
import type { McapTypes } from "@mcap/core";
import { safeNumber } from "../../../query/bytes/bigint-utils";
import {
  isMcapDecodeStageMeterEnabled,
  mcapDecodeStageNowMs,
  recordMcapDecodeStage,
} from "../instrumentation/meters/decode-stage";
import { isMcapDecompressionCacheMeterEnabled } from "../instrumentation/meters/decompression-cache";
import type {
  McapDecompressedChunkKey,
  McapDecompressedChunkLoad,
} from "./decompressed-chunk-cache";

const MCAP_CHUNK_OPCODE = 0x06;
const MCAP_RECORD_HEADER_BYTES = 9;
const MIN_CHUNK_RECORD_BYTES = MCAP_RECORD_HEADER_BYTES + 8 + 8 + 8 + 4 + 4 + 8;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];

export function mcapDecompressedChunkKeyForIndex(
  sourceKey: string,
  chunk: McapChunkIndex,
): McapDecompressedChunkKey {
  return {
    compressedLength: chunk.compressedSize,
    compressedOffset:
      chunk.chunkStartOffset +
      BigInt(
        MIN_CHUNK_RECORD_BYTES +
          textEncoder.encode(chunk.compression).byteLength,
      ),
    compression: chunk.compression,
    decompressedSize: chunk.uncompressedSize,
    sourceKey,
  };
}

/** Validates and decompresses one complete MCAP Chunk record into records. */
export function decompressMcapChunkRecord(
  bytes: Uint8Array,
  chunk: McapChunkIndex,
  handlers: McapTypes.DecompressHandlers,
): McapDecompressedChunkLoad {
  const expectedChunkLength = safeNumber(chunk.chunkLength);
  if (
    bytes.byteLength !== expectedChunkLength ||
    bytes.byteLength < MIN_CHUNK_RECORD_BYTES
  ) {
    throw new Error(
      `MCAP Chunk byte length ${bytes.byteLength} did not match index length ${expectedChunkLength}`,
    );
  }

  const view = dataView(bytes);
  let offset = 0;
  if (view.getUint8(offset) !== MCAP_CHUNK_OPCODE) {
    throw new Error(
      `Expected MCAP Chunk record at ${chunk.chunkStartOffset.toString()}`,
    );
  }
  offset += 1;
  const recordLength = safeNumber(view.getBigUint64(offset, true));
  offset += 8;
  const recordEnd = offset + recordLength;
  if (recordEnd !== bytes.byteLength) {
    throw new Error("MCAP Chunk record length does not match source bytes");
  }

  const messageStartTime = view.getBigUint64(offset, true);
  offset += 8;
  const messageEndTime = view.getBigUint64(offset, true);
  offset += 8;
  const uncompressedSize = view.getBigUint64(offset, true);
  offset += 8;
  const uncompressedCrc = view.getUint32(offset, true);
  offset += 4;
  const compressionLength = view.getUint32(offset, true);
  offset += 4;
  const compressionEnd = offset + compressionLength;
  if (compressionEnd + 8 > recordEnd) {
    throw new Error("MCAP Chunk compression name exceeds record bounds");
  }
  const compression = textDecoder.decode(
    bytes.subarray(offset, compressionEnd),
  );
  offset = compressionEnd;
  const recordsLength = safeNumber(view.getBigUint64(offset, true));
  offset += 8;
  const recordsEnd = offset + recordsLength;
  if (recordsEnd !== recordEnd) {
    throw new Error("MCAP Chunk records length does not match record bounds");
  }
  if (
    messageStartTime !== chunk.messageStartTime ||
    messageEndTime !== chunk.messageEndTime ||
    compression !== chunk.compression ||
    uncompressedSize !== chunk.uncompressedSize ||
    BigInt(recordsLength) !== chunk.compressedSize
  ) {
    throw new Error("MCAP chunk index/data mismatch");
  }

  const encoded = bytes.subarray(offset, recordsEnd);
  const decompressed =
    compression.length === 0
      ? encoded.slice()
      : handlers[compression]?.(encoded, uncompressedSize);
  if (!decompressed) {
    throw new Error(`Unsupported MCAP chunk compression '${compression}'`);
  }
  const records =
    decompressed.byteOffset === 0 &&
    decompressed.byteLength === decompressed.buffer.byteLength
      ? decompressed
      : decompressed.slice();
  if (BigInt(records.byteLength) !== uncompressedSize) {
    throw new Error(
      `Expected ${uncompressedSize.toString()} decompressed bytes but received ${records.byteLength}`,
    );
  }
  if (uncompressedCrc !== 0 && crc32(records) !== uncompressedCrc) {
    throw new Error("Incorrect MCAP chunk CRC");
  }
  return { bytes: records };
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
