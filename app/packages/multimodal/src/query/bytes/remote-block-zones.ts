import { defaultByteCacheBlockSizeBytes } from "./cached-byte-client";
import { parseByteSize } from "./byte-size";
import type { ByteCacheBlockSizeBytes, ByteRangeReadRequest } from "./types";

/**
 * Offset-zoned block sizing for large remote fills.
 *
 * Big blocks win during sustained sequential playback (fewer requests, the
 * link stays in transfer instead of turnaround), but the latency-critical
 * cold reads live at the file's edges: indexed-container metadata at the
 * tail and the first playback window at the head each sit behind a single
 * fill, so a 32 MiB fill there multiplies time-to-timeline. Zone the file
 * by offset instead of adapting over time: edges fill small, the body
 * fills large.
 *
 * Zoning must be a pure function of offset (never of history) — every worker
 * lane and session must agree on fill shapes, because the fill locks and the
 * persistent cache dedupe on exact ranges. A count-based ramp was measured
 * re-fetching 21% of wire bytes purely from mixed 8/32 MiB grids;
 * deterministic zones cannot mix. Zone boundaries are multiples of the
 * large block so the grids never overlap.
 */

const SMALL_ZONE_BLOCK_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * Head region served with small blocks: covers the first playback window.
 */
const HEAD_SMALL_ZONE_BYTES = 64n * 1024n * 1024n;

/**
 * Tail region served with small blocks: covers container summaries, indexes,
 * and footers.
 */
const TAIL_SMALL_ZONE_BYTES = 64n * 1024n * 1024n;

/**
 * Wraps a block-size policy so file-edge fills stay small while body
 * fills keep the (large) base size.
 */
export function createZonedRemoteBlockSize(
  base?: ByteCacheBlockSizeBytes,
): (request: ByteRangeReadRequest) => number | undefined {
  return (request) => {
    const resolved =
      typeof base === "function"
        ? base(request)
        : (base ?? defaultByteCacheBlockSizeBytes(request));
    if (resolved === undefined || resolved <= SMALL_ZONE_BLOCK_SIZE_BYTES) {
      return resolved;
    }

    const sourceSize = parseByteSize(request.source.sizeBytes);
    if (sourceSize === undefined) {
      // Without a known size the cached client cannot widen anyway; report
      // the small size so probe reads stay cheap.
      return SMALL_ZONE_BLOCK_SIZE_BYTES;
    }

    const offset = request.range.offset;
    if (offset < HEAD_SMALL_ZONE_BYTES) {
      return SMALL_ZONE_BLOCK_SIZE_BYTES;
    }

    // Align the tail-zone start down to the large-block grid so no large
    // fill straddles into the small zone.
    const largeBlock = BigInt(resolved);
    const tailStart =
      sourceSize > TAIL_SMALL_ZONE_BYTES
        ? ((sourceSize - TAIL_SMALL_ZONE_BYTES) / largeBlock) * largeBlock
        : 0n;
    if (offset >= tailStart) {
      return SMALL_ZONE_BLOCK_SIZE_BYTES;
    }

    return resolved;
  };
}
