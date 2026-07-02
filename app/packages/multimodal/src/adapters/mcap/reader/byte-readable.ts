import type { McapTypes } from "@mcap/core";
import type {
  ByteClient,
  ByteRangeReadResult,
  ByteSourceDescriptor,
} from "../../../query/bytes";
import { parseByteSize } from "../../../query/bytes";

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
    return this.readRange(offset, size, { blockFill: false });
  }

  private async readRange(
    offset: bigint,
    size: bigint,
    cachePolicy?: { readonly blockFill?: boolean },
  ): Promise<Uint8Array> {
    // Warm-cache walks (topic bounds, index scans, per-message decode reads)
    // never reach a network boundary, so a cancelled job would otherwise hold
    // its serial lane for seconds of pure CPU. Every read consults the
    // active request's signal, making cancellation effective on cache hits.
    const activeSignal = this.options.readSignal?.current;
    if (activeSignal?.aborted) {
      throw abortedReadableError();
    }
    const sourceSize = this.resolvedSizeBytes ?? sourceSizeBytes(this.source);
    if (sourceSize !== undefined && offset + size > sourceSize) {
      throw new Error(
        `Read of ${size.toString()} bytes at offset ${offset.toString()} exceeds source size ${sourceSize.toString()}`,
      );
    }

    if (size === 0n) {
      return new Uint8Array();
    }

    const readKey = readRangeKey(offset, size, cachePolicy);
    const pending = this.inFlightReads.get(readKey);
    const cacheResult = pending ? "coalesced" : "fetched";
    const signal = this.options.readSignal?.current ?? undefined;
    const result = await (pending ??
      this.startReadRange(readKey, {
        cachePolicy,
        range: { length: size, offset },
        ...(signal ? { signal } : {}),
        source: this.source,
      }));
    this.updateSource(result.source);
    this.logChunkRead(
      offset,
      size,
      cacheResult === "coalesced" ? 0 : result.bytes.byteLength,
      cacheResult,
    );

    return result.bytes;
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

function abortedReadableError(): Error {
  const error = new Error("MCAP read aborted");
  error.name = "AbortError";
  return error;
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
      messageIndexRange.start,
      messageIndexRange.end,
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

function chunkMessageIndexRange(
  chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"],
): { readonly end: bigint; readonly start: bigint } | null {
  const offsets = [...chunkIndex.messageIndexOffsets.values()];
  if (offsets.length === 0 || chunkIndex.messageIndexLength === 0n) {
    return null;
  }

  const start = offsets.reduce((min, candidate) =>
    candidate < min ? candidate : min,
  );
  return {
    end: start + chunkIndex.messageIndexLength,
    start,
  };
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
  cachePolicy: { readonly blockFill?: boolean } | undefined,
): string {
  return [
    offset.toString(),
    size.toString(),
    cachePolicy?.blockFill === false ? "exact" : "default",
  ].join(":");
}

function defaultChunkReadLogger(entry: McapChunkReadDebugLog): void {
  console.log("[mcap] chunk bytes fetched", entry);
}
