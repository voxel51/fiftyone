import { McapIndexedReader, type McapTypes } from "@mcap/core";
import type { ByteResourceClient } from "../client";
import { loadMcapDecompressHandlers } from "./decompress/handlers";
import type { McapSourceDescriptor } from "./types";

type DecompressHandlers = McapTypes.DecompressHandlers;

/**
 * Seekable byte-readable source consumed by @mcap/core.
 */
export type McapReadable = McapTypes.IReadable;
type TypedMcapRecords = McapTypes.TypedMcapRecords;

/**
 * Reader factory used by MCAP production code and tests.
 */
export type McapReaderFactory = (
  source: McapSourceDescriptor,
  readable: McapReadable
) => Promise<McapIndexedReaderLike>;

/**
 * Indexed MCAP reader surface used by this adapter.
 */
export interface McapIndexedReaderLike {
  readonly channelsById: ReadonlyMap<number, TypedMcapRecords["Channel"]>;
  readonly schemasById: ReadonlyMap<number, TypedMcapRecords["Schema"]>;

  readMessages(args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }): AsyncGenerator<TypedMcapRecords["Message"], void, void>;
}

type McapInitializedReader = McapIndexedReaderLike & {
  readonly chunkIndexes: readonly TypedMcapRecords["ChunkIndex"][];
};

/**
 * Creates the default indexed MCAP reader with supported chunk decompressors.
 */
export async function createDefaultMcapReader(
  _source: McapSourceDescriptor,
  readable: McapReadable
): Promise<McapIndexedReaderLike> {
  const reader = await initializeDefaultMcapReader(
    readable,
    await loadMcapDecompressHandlers()
  );
  const chunkCompressions = compressedChunkTypes(reader);
  assertSupportedChunkCompressions(chunkCompressions);

  return reader;
}

/**
 * Gets or initializes the cached reader promise for one MCAP source.
 */
export async function getReader(
  readers: Map<string, Promise<McapIndexedReaderLike>>,
  readerFactory: McapReaderFactory,
  byteClient: ByteResourceClient,
  source: McapSourceDescriptor
) {
  const key = sourceKey(source);
  let reader = readers.get(key);

  if (!reader) {
    reader = readerFactory(
      source,
      new ByteClientReadable(source, byteClient)
    ).catch((error) => {
      readers.delete(key);
      throw error;
    });
    readers.set(key, reader);
  }

  return reader;
}

async function initializeDefaultMcapReader(
  readable: McapReadable,
  decompressHandlers: DecompressHandlers
): Promise<McapInitializedReader> {
  return McapIndexedReader.Initialize({
    decompressHandlers,
    messageIndexCacheSizeBytes: 128 * 1024 * 1024,
    readable,
  });
}

function compressedChunkTypes(
  reader: McapInitializedReader
): ReadonlySet<string> {
  return new Set(
    reader.chunkIndexes
      .map((chunkIndex) => chunkIndex.compression)
      .filter((compression) => compression.length > 0)
  );
}

function assertSupportedChunkCompressions(compressions: ReadonlySet<string>) {
  const unsupported = [...compressions]
    .filter((compression) => compression !== "lz4" && compression !== "zstd")
    .sort();

  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported MCAP chunk compression: ${unsupported.join(
        ", "
      )}. Supported compressions are lz4 and zstd.`
    );
  }
}

class ByteClientReadable implements McapReadable {
  private source: McapSourceDescriptor;
  private resolvedSizeBytes?: bigint;

  constructor(
    source: McapSourceDescriptor,
    private readonly byteClient: ByteResourceClient
  ) {
    this.source = source;
  }

  async size(): Promise<bigint> {
    const sizeBytes = sourceSizeBytes(this.source);
    if (sizeBytes !== undefined) {
      return sizeBytes;
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

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    const sourceSize = sourceSizeBytes(this.source) ?? this.resolvedSizeBytes;
    if (sourceSize !== undefined && offset + size > sourceSize) {
      throw new Error(
        `Read of ${size.toString()} bytes at offset ${offset.toString()} exceeds source size ${sourceSize.toString()}`
      );
    }

    if (size === 0n) {
      return new Uint8Array();
    }

    const result = await this.byteClient.readBytes({
      range: { length: size, offset },
      source: this.source,
    });
    this.updateSource(result.source);

    return result.bytes;
  }

  private updateSource(source: McapSourceDescriptor) {
    const sizeBytes = sourceSizeBytes(source);
    if (sizeBytes !== undefined) {
      this.resolvedSizeBytes = sizeBytes;
      this.source = source;
    }
  }
}

function sourceSizeBytes(source: McapSourceDescriptor): bigint | undefined {
  const sizeBytes = source.sizeBytes ?? source.fingerprint?.sizeBytes;
  return sizeBytes === undefined ? undefined : BigInt(sizeBytes);
}

function sourceKey(source: McapSourceDescriptor): string {
  return [
    source.sourceId,
    source.url,
    source.sizeBytes ?? source.fingerprint?.sizeBytes ?? "",
    source.fingerprint?.firstChunkCrc?.toString() ?? "",
    source.fingerprint?.lastChunkCrc?.toString() ?? "",
  ].join("|");
}
