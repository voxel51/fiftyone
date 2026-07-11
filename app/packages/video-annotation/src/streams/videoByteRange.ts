/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Pure chunking/streaming helpers for range-based video fetching.
 *
 * The native decode worker parses the `moov` (sample table) up front, then
 * fetches only the byte ranges a chunk's GOP needs via HTTP `Range` requests,
 * so it never loads the whole source video into memory. This module holds the
 * arithmetic and response-shape logic for that — deliberately free of `fetch`,
 * workers, and mp4box so it is exhaustively unit-testable; the worker wires
 * these into the network + decoder.
 */

/** The byte location of one encoded sample within the source file. */
export interface SampleLocation {
  /** Absolute byte offset of the sample in the file. */
  offset: number;
  /** Encoded byte length of the sample. */
  size: number;
}

/** A half-open byte range `[start, end)` within the source file. */
export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** One past the last byte, exclusive. */
  end: number;
}

/**
 * Smallest byte range covering samples `[startIndex, endIndex]` (inclusive,
 * order-agnostic) of `samples`. Since a GOP's samples are usually — but not
 * always — contiguous in `mdat`, we take the min offset → max end across the
 * span; fetching a superset (a few interleaved non-video bytes) is harmless.
 * Returns `null` when the span covers no samples.
 */
export function spanByteRange(
  samples: readonly SampleLocation[],
  startIndex: number,
  endIndex: number,
): ByteRange | null {
  const lo = Math.max(0, Math.min(startIndex, endIndex));
  const hi = Math.min(samples.length - 1, Math.max(startIndex, endIndex));

  let start = Number.POSITIVE_INFINITY;
  let end = -1;
  for (let i = lo; i <= hi; i++) {
    const s = samples[i];
    if (!s) {
      continue;
    }

    start = Math.min(start, s.offset);
    end = Math.max(end, s.offset + s.size);
  }

  if (end < 0) {
    return null;
  }

  return { start, end };
}

/** The `Range` request header value for a byte range (`bytes=start-lastByte`). */
export function rangeRequestHeader(range: ByteRange): string {
  return `bytes=${range.start}-${range.end - 1}`;
}

/**
 * The absolute file offset the body of a `206` response starts at, read from
 * its `Content-Range` (`bytes 200-999/12345`). Returns `null` when the header
 * is absent or unparseable, so the caller can fall back to the offset it asked
 * for.
 */
export function parseContentRangeStart(
  header: string | null | undefined,
): number | null {
  if (!header) {
    return null;
  }

  const match = /bytes\s+(\d+)-(\d+)\//i.exec(header);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

/** What a media response's status means for range fetching. */
export type RangeResponseKind =
  /** `206` — the body is exactly the requested range. */
  | "range"
  /** `200` — the server ignored `Range` and returned the whole file. */
  | "whole"
  /** Anything else (e.g. `416`) — give up on ranges, fetch whole-file. */
  | "reject";

/** Classify a media response status for the range-fetch state machine. */
export function classifyRangeResponse(status: number): RangeResponseKind {
  if (status === 206) {
    return "range";
  }

  if (status === 200) {
    return "whole";
  }

  return "reject";
}

/**
 * View of one sample's encoded bytes within a fetched buffer. `bufferFileStart`
 * is the buffer's absolute file offset (`0` for a whole-file body, the range
 * start for a `206` body). Throws when the sample falls outside the buffer —
 * that means the fetched range didn't actually cover it (a bug, not a
 * recoverable state).
 */
export function sliceSampleBytes(
  buffer: ArrayBuffer,
  bufferFileStart: number,
  sample: SampleLocation,
): Uint8Array {
  const localStart = sample.offset - bufferFileStart;
  const localEnd = localStart + sample.size;

  if (localStart < 0 || localEnd > buffer.byteLength) {
    throw new Error(
      `sample [${sample.offset}, ${sample.offset + sample.size}) outside ` +
        `fetched buffer [${bufferFileStart}, ` +
        `${bufferFileStart + buffer.byteLength})`,
    );
  }

  return new Uint8Array(buffer, localStart, sample.size);
}

/**
 * A tiny LRU of fetched byte ranges, bounded by a total-bytes budget. Keyed by
 * the exact range, so it pays off when the base re-requests an identical chunk
 * span after its decoded bitmaps were evicted — cheap insurance against
 * re-downloading a GOP during long playback. Encoded GOP spans are small next
 * to the decoded-bitmap LRU, so the budget stays modest.
 */
export class ByteRangeCache {
  private readonly budgetBytes: number;
  private totalBytes = 0;
  /** Insertion-ordered; a hit re-inserts to mark most-recently-used. */
  private readonly entries = new Map<string, ArrayBuffer>();

  constructor(budgetBytes: number) {
    this.budgetBytes = budgetBytes;
  }

  private static key(range: ByteRange): string {
    return `${range.start}-${range.end}`;
  }

  /** Cached bytes for an exact range, or `undefined`. Marks the entry MRU. */
  get(range: ByteRange): ArrayBuffer | undefined {
    const key = ByteRangeCache.key(range);
    const buffer = this.entries.get(key);
    if (!buffer) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, buffer);
    return buffer;
  }

  /** Cache bytes for a range, evicting LRU entries to stay within budget. */
  set(range: ByteRange, buffer: ArrayBuffer): void {
    const key = ByteRangeCache.key(range);
    const existing = this.entries.get(key);
    if (existing) {
      this.totalBytes -= existing.byteLength;
      this.entries.delete(key);
    }

    // A buffer larger than the whole budget would evict everything and still
    // not fit — don't bother caching it.
    if (buffer.byteLength > this.budgetBytes) {
      return;
    }

    this.entries.set(key, buffer);
    this.totalBytes += buffer.byteLength;
    this.evict();
  }

  private evict(): void {
    while (this.totalBytes > this.budgetBytes && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value as string;
      const buffer = this.entries.get(oldest);
      if (buffer) {
        this.totalBytes -= buffer.byteLength;
      }

      this.entries.delete(oldest);
    }
  }

  /** Bytes currently held. */
  get sizeBytes(): number {
    return this.totalBytes;
  }

  /** Number of ranges currently cached. */
  get count(): number {
    return this.entries.size;
  }
}
