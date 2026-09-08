import { EpisodeReadUnsupportedError } from "../../../../ports";

/** Indexed chunks admitted by one raw-record read. */
export const RAW_RECORD_MAX_CHUNKS = 256;

/** Physical chunk bytes admitted by one raw-record read. */
export const RAW_RECORD_MAX_SOURCE_BYTES = 64 * 1024 * 1024;

/** Uncompressed chunk bytes admitted by one raw-record read. */
export const RAW_RECORD_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

/** Enforces the shared indexed-source work bound for raw-record operations. */
export function assertRawRecordSourceWorkBound(
  chunkCount: number,
  sourceBytes: bigint,
  uncompressedBytes: bigint,
): void {
  if (
    chunkCount <= RAW_RECORD_MAX_CHUNKS &&
    sourceBytes <= BigInt(RAW_RECORD_MAX_SOURCE_BYTES) &&
    uncompressedBytes <= BigInt(RAW_RECORD_MAX_UNCOMPRESSED_BYTES)
  ) {
    return;
  }
  throw new EpisodeReadUnsupportedError(
    "raw-record-source-work",
    `Raw lookup exceeded its per-read indexed-source bound (${RAW_RECORD_MAX_CHUNKS} chunks, ${RAW_RECORD_MAX_SOURCE_BYTES} source bytes, or ${RAW_RECORD_MAX_UNCOMPRESSED_BYTES} uncompressed bytes)`,
  );
}
