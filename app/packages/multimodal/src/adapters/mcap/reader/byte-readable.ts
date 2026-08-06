import type { McapTypes } from "@mcap/core";
import type {
  ByteClient,
  ByteRange,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
} from "../../../query/bytes";
import { byteSourceAccessKey, parseByteSize } from "../../../query/bytes";
import { createAbortError } from "../../../utils/cancellation";
import { chunkMessageIndexRange } from "./chunk-index-ranges";

export interface McapChunkReadDebugLog {
  readonly cacheResult: "coalesced" | "fetched";
  readonly chunkId: string;
  readonly chunkLengthBytes: string;
  readonly chunkStartOffset: string;
  readonly compression: string;
  readonly fetchedBytes: number;
  readonly kind: "chunk" | "chunk-message-index";
  readonly overlapBytes: string;
  readonly readOffset: string;
  readonly requestedBytes: string;
}

export interface ByteClientReadableOptions {
  readonly debugChunkReads?: boolean;
  readonly logChunkRead?: (entry: McapChunkReadDebugLog) => void;
  /**
   * Holder for the abort signal of the currently-executing request. Worker
   * lanes run one request at a time, so a single mutable slot scopes reads
   * to their owning request without threading signals through `@mcap/core`.
   */
  readonly readSignal?: { readonly current: AbortSignal | null };
}

/** One contained byte read with its preplanned fill and transfer attribution. */
export interface McapContainedByteRead {
  readonly bytes: Uint8Array;
  readonly fillRange: ByteRange;
  readonly transferredBytes: number;
}

export interface McapReadableSourceRange {
  readonly length: bigint;
  readonly offset: bigint;
  readonly sourceKey: string;
}

interface ReadBufferAnchor {
  readonly byteOffset: number;
  readonly length: number;
  readonly sourceOffset: bigint;
  readonly sourceKey: string;
}

/**
 * Adapts the generic byte query client to the seekable MCAP readable API.
 */
export class ByteClientReadable implements McapTypes.IReadable {
  private chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    [];
  private readonly inFlightReads = new Map<
    string,
    Promise<ByteRangeReadResult>
  >();
  private readonly readBufferAnchors = new WeakMap<
    ArrayBufferLike,
    ReadBufferAnchor[]
  >();
  private source: ByteSourceDescriptor;
  private resolvedSizeBytes?: bigint;
  private etagDiscoveryStarted = false;

  constructor(
    source: ByteSourceDescriptor,
    private readonly byteClient: ByteClient,
    private readonly options: ByteClientReadableOptions = {},
  ) {
    this.source = source;
  }

  setChunkIndexes(
    chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][],
  ): void {
    this.chunkIndexes = chunkIndexes;
  }

  /** Resolves a returned view or slice to its exact source byte range. */
  sourceRangeForBytes(bytes: Uint8Array): McapReadableSourceRange | undefined {
    const anchors = this.readBufferAnchors.get(bytes.buffer);
    if (!anchors || bytes.buffer.byteLength === 0) {
      return undefined;
    }
    const viewEnd = bytes.byteOffset + bytes.byteLength;
    const matchingAnchors = anchors.filter(
      (candidate) =>
        bytes.byteOffset >= candidate.byteOffset &&
        viewEnd <= candidate.byteOffset + candidate.length,
    );
    const anchor = matchingAnchors[0];
    if (!anchor) {
      return undefined;
    }
    const offset =
      anchor.sourceOffset + BigInt(bytes.byteOffset - anchor.byteOffset);
    if (
      matchingAnchors.some(
        (candidate) =>
          candidate.sourceKey !== anchor.sourceKey ||
          candidate.sourceOffset +
            BigInt(bytes.byteOffset - candidate.byteOffset) !==
            offset,
      )
    ) {
      // A byte client reused one mutable backing range for different source
      // identities. There is no collision-safe identity for this view.
      return undefined;
    }
    return {
      length: BigInt(bytes.byteLength),
      offset,
      sourceKey: anchor.sourceKey,
    };
  }

  /** Source/content-version identity tied to one returned read buffer. */
  sourceIdentityForBytes(bytes: Uint8Array): string | undefined {
    return this.sourceRangeForBytes(bytes)?.sourceKey;
  }

  /** Current access/content identity, including a discovered validator. */
  sourceAccessKey(): string {
    return byteSourceAccessKey(this.source);
  }

  async size(): Promise<bigint> {
    const sizeBytes = sourceSizeBytes(this.source);
    if (sizeBytes !== undefined) {
      // Metadata-provided sizes can make a warm persistent-cache session
      // fully network-free, which would leave stale entries unvalidated
      // forever. One non-blocking HEAD discovers the content validator so
      // cache lookups from here on can compare against it.
      this.discoverEtagInBackground();
      return sizeBytes;
    }

    if (this.resolvedSizeBytes !== undefined) {
      return this.resolvedSizeBytes;
    }

    // Prefer cheap transport metadata before doing a tiny ranged GET; many
    // object stores allow range reads but block HEAD, so both paths are needed.
    const statSource = await this.byteClient.stat?.(this.source);
    if (statSource) {
      this.updateSource(statSource);
    }

    if (this.resolvedSizeBytes !== undefined) {
      return this.resolvedSizeBytes;
    }

    const result = await this.byteClient.readBytes({
      range: { length: 1n, offset: 0n },
      source: this.source,
    });
    this.updateSource(result.source);

    if (this.resolvedSizeBytes === undefined) {
      throw new Error("MCAP source size is required for indexed reads");
    }

    return this.resolvedSizeBytes;
  }

  private discoverEtagInBackground(): void {
    if (this.source.etag !== undefined || this.etagDiscoveryStarted) {
      return;
    }
    this.etagDiscoveryStarted = true;
    const stat = this.byteClient.stat?.(this.source);
    if (!stat) {
      return;
    }
    void stat
      .then((statSource) => {
        if (statSource) {
          this.updateSource(statSource);
        }
      })
      .catch(() => undefined);
  }

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size);
  }

  async readExact(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size, {
      blockFill: false,
      readahead: false,
    });
  }

  /** Plans the physical cache fill without performing the read. */
  planReadRange(
    offset: bigint,
    size: bigint,
    cachePolicy?: ByteRangeReadRequest["cachePolicy"],
  ): ByteRange {
    const request = {
      ...(cachePolicy ? { cachePolicy } : {}),
      range: { length: size, offset },
      source: this.source,
    };
    return (this.byteClient.planRead?.(request) ?? request).range;
  }

  /**
   * Executes one admitted range with autonomous readahead disabled and
   * reports the underlying cache-fill/transport attribution.
   */
  async readContained(
    offset: bigint,
    size: bigint,
    options: {
      readonly exact?: boolean;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<McapContainedByteRead> {
    const cachePolicy = {
      ...(options.exact ? { blockFill: false } : {}),
      readahead: false,
    } as const;
    const fillRange = this.planReadRange(offset, size, cachePolicy);
    const result = await this.readRangeResult(
      offset,
      size,
      cachePolicy,
      options.signal,
    );
    return {
      bytes: result.bytes,
      fillRange,
      transferredBytes:
        result.readUsage?.transferredBytes ?? result.bytes.byteLength,
    };
  }

  private async readRange(
    offset: bigint,
    size: bigint,
    cachePolicy?: ByteRangeReadRequest["cachePolicy"],
  ): Promise<Uint8Array> {
    return (await this.readRangeResult(offset, size, cachePolicy)).bytes;
  }

  private async readRangeResult(
    offset: bigint,
    size: bigint,
    cachePolicy?: ByteRangeReadRequest["cachePolicy"],
    signalOverride?: AbortSignal,
  ): Promise<ByteRangeReadResult> {
    // Warm-cache walks (topic bounds, index scans, per-message decode reads)
    // never reach a network boundary, so a cancelled job would otherwise hold
    // its serial lane for seconds of pure CPU. Every read consults the
    // active request's signal, making cancellation effective on cache hits.
    const activeSignal = signalOverride ?? this.options.readSignal?.current;
    if (activeSignal?.aborted) {
      throw createAbortError("MCAP read aborted");
    }
    const sourceSize = this.resolvedSizeBytes ?? sourceSizeBytes(this.source);
    if (sourceSize !== undefined && offset + size > sourceSize) {
      throw new Error(
        `Read of ${size.toString()} bytes at offset ${offset.toString()} exceeds source size ${sourceSize.toString()}`,
      );
    }

    if (size === 0n) {
      return {
        bytes: new Uint8Array(),
        range: { length: 0n, offset },
        source: this.source,
      };
    }

    const readKey = readRangeKey(offset, size, cachePolicy);
    const pending = this.inFlightReads.get(readKey);
    const cacheResult = pending ? "coalesced" : "fetched";
    const signal =
      signalOverride ?? this.options.readSignal?.current ?? undefined;
    const result = await (pending ??
      this.startReadRange(readKey, {
        cachePolicy,
        range: { length: size, offset },
        ...(signal ? { signal } : {}),
        source: this.source,
      }));
    this.updateSource(result.source);
    this.registerReadBuffer(result);
    this.logChunkRead(
      offset,
      size,
      cacheResult === "coalesced" ? 0 : result.bytes.byteLength,
      cacheResult,
    );

    return result;
  }

  private registerReadBuffer(result: ByteRangeReadResult): void {
    if (result.bytes.buffer.byteLength === 0) {
      return;
    }
    const anchors = this.readBufferAnchors.get(result.bytes.buffer) ?? [];
    const anchor: ReadBufferAnchor = {
      byteOffset: result.bytes.byteOffset,
      length: result.bytes.byteLength,
      sourceOffset: result.range.offset,
      sourceKey: byteSourceAccessKey(result.source),
    };
    if (
      !anchors.some(
        (candidate) =>
          candidate.byteOffset === anchor.byteOffset &&
          candidate.length === anchor.length &&
          candidate.sourceOffset === anchor.sourceOffset &&
          candidate.sourceKey === anchor.sourceKey,
      )
    ) {
      anchors.push(anchor);
      this.readBufferAnchors.set(result.bytes.buffer, anchors);
    }
  }

  private startReadRange(
    readKey: string,
    request: Parameters<ByteClient["readBytes"]>[0],
  ): Promise<ByteRangeReadResult> {
    const read = this.byteClient.readBytes(request).finally(() => {
      if (this.inFlightReads.get(readKey) === read) {
        this.inFlightReads.delete(readKey);
      }
    });
    this.inFlightReads.set(readKey, read);
    return read;
  }

  private updateSource(source: ByteSourceDescriptor) {
    const sizeBytes = sourceSizeBytes(source);
    if (sizeBytes !== undefined) {
      this.resolvedSizeBytes = sizeBytes;
      this.source = source;
      return;
    }
    // A stat can return a validator without a usable size; absorb it so
    // subsequent reads carry the etag to cache lookups.
    if (source.etag !== undefined && this.source.etag !== source.etag) {
      this.source = { ...this.source, etag: source.etag };
    }
  }

  private logChunkRead(
    offset: bigint,
    size: bigint,
    fetchedBytes: number,
    cacheResult: McapChunkReadDebugLog["cacheResult"],
  ): void {
    if (!this.options.debugChunkReads || this.chunkIndexes.length === 0) {
      return;
    }

    for (const entry of chunkReadDebugEntries({
      cacheResult,
      chunkIndexes: this.chunkIndexes,
      fetchedBytes,
      offset,
      size,
    })) {
      (this.options.logChunkRead ?? defaultChunkReadLogger)(entry);
    }
  }
}

function sourceSizeBytes(source: ByteSourceDescriptor): bigint | undefined {
  // Bad sample metadata should fall back to unknown-size reads, not crash
  // before the reader can ask the byte client for transport-discovered size.
  return parseByteSize(source.sizeBytes);
}

function chunkReadDebugEntries({
  cacheResult,
  chunkIndexes,
  fetchedBytes,
  offset,
  size,
}: {
  readonly cacheResult: McapChunkReadDebugLog["cacheResult"];
  readonly chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
  readonly fetchedBytes: number;
  readonly offset: bigint;
  readonly size: bigint;
}): McapChunkReadDebugLog[] {
  const readStart = offset;
  const readEnd = offset + size;
  const entries: McapChunkReadDebugLog[] = [];

  for (const chunkIndex of chunkIndexes) {
    const chunkStart = chunkIndex.chunkStartOffset;
    const chunkEnd = chunkStart + chunkIndex.chunkLength;
    const chunkOverlap = rangeOverlapBytes(
      readStart,
      readEnd,
      chunkStart,
      chunkEnd,
    );
    if (chunkOverlap > 0n) {
      entries.push(
        chunkReadDebugLog({
          cacheResult,
          chunkIndex,
          fetchedBytes,
          kind: "chunk",
          offset,
          overlapBytes: chunkOverlap,
          size,
        }),
      );
      continue;
    }

    const messageIndexRange = chunkMessageIndexRange(chunkIndex);
    if (!messageIndexRange) {
      continue;
    }
    const messageIndexOverlap = rangeOverlapBytes(
      readStart,
      readEnd,
      messageIndexRange.offset,
      messageIndexRange.offset + messageIndexRange.length,
    );
    if (messageIndexOverlap > 0n) {
      entries.push(
        chunkReadDebugLog({
          cacheResult,
          chunkIndex,
          fetchedBytes,
          kind: "chunk-message-index",
          offset,
          overlapBytes: messageIndexOverlap,
          size,
        }),
      );
    }
  }

  return entries;
}

function rangeOverlapBytes(
  leftStart: bigint,
  leftEnd: bigint,
  rightStart: bigint,
  rightEnd: bigint,
): bigint {
  const start = leftStart > rightStart ? leftStart : rightStart;
  const end = leftEnd < rightEnd ? leftEnd : rightEnd;
  return end > start ? end - start : 0n;
}

function chunkReadDebugLog({
  cacheResult,
  chunkIndex,
  fetchedBytes,
  kind,
  offset,
  overlapBytes,
  size,
}: {
  readonly cacheResult: McapChunkReadDebugLog["cacheResult"];
  readonly chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"];
  readonly fetchedBytes: number;
  readonly kind: McapChunkReadDebugLog["kind"];
  readonly offset: bigint;
  readonly overlapBytes: bigint;
  readonly size: bigint;
}): McapChunkReadDebugLog {
  return {
    cacheResult,
    chunkId: chunkIndex.chunkStartOffset.toString(),
    chunkLengthBytes: chunkIndex.chunkLength.toString(),
    chunkStartOffset: chunkIndex.chunkStartOffset.toString(),
    compression: chunkIndex.compression || "none",
    fetchedBytes,
    kind,
    overlapBytes: overlapBytes.toString(),
    readOffset: offset.toString(),
    requestedBytes: size.toString(),
  };
}

function readRangeKey(
  offset: bigint,
  size: bigint,
  cachePolicy: ByteRangeReadRequest["cachePolicy"] | undefined,
): string {
  return [
    offset.toString(),
    size.toString(),
    cachePolicy?.blockFill === false ? "exact" : "default",
    cachePolicy?.readahead === false ? "contained" : "readahead",
  ].join(":");
}

function defaultChunkReadLogger(entry: McapChunkReadDebugLog): void {
  console.log("[mcap] chunk bytes fetched", entry);
}

