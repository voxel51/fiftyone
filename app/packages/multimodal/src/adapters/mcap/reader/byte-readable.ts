import type { McapTypes } from "@mcap/core";
import type {
  ByteResourceClient,
  ByteSourceDescriptor,
} from "../../../client/resources";

/**
 * Adapts the generic byte-resource client to the seekable MCAP readable API.
 */
export class ByteClientReadable implements McapTypes.IReadable {
  private source: ByteSourceDescriptor;
  private resolvedSizeBytes?: bigint;

  constructor(
    source: ByteSourceDescriptor,
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

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size);
  }

  async readExact(offset: bigint, size: bigint): Promise<Uint8Array> {
    return this.readRange(offset, size, { blockFill: false });
  }

  private async readRange(
    offset: bigint,
    size: bigint,
    cachePolicy?: { readonly blockFill?: boolean }
  ): Promise<Uint8Array> {
    const sourceSize = this.resolvedSizeBytes ?? sourceSizeBytes(this.source);
    if (sourceSize !== undefined && offset + size > sourceSize) {
      throw new Error(
        `Read of ${size.toString()} bytes at offset ${offset.toString()} exceeds source size ${sourceSize.toString()}`
      );
    }

    if (size === 0n) {
      return new Uint8Array();
    }

    const result = await this.byteClient.readBytes({
      cachePolicy,
      range: { length: size, offset },
      source: this.source,
    });
    this.updateSource(result.source);

    return result.bytes;
  }

  private updateSource(source: ByteSourceDescriptor) {
    const sizeBytes = sourceSizeBytes(source);
    if (sizeBytes !== undefined) {
      this.resolvedSizeBytes = sizeBytes;
      this.source = source;
    }
  }
}

function sourceSizeBytes(source: ByteSourceDescriptor): bigint | undefined {
  const sizeBytes: unknown = source.sizeBytes;
  if (sizeBytes === undefined) {
    return undefined;
  }

  // Bad sample metadata should make the MCAP reader fall back to unknown-size
  // reads, not crash before it can ask the byte client for data.
  if (typeof sizeBytes === "number") {
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return undefined;
    }

    const integerSizeBytes = Math.floor(sizeBytes);
    return Number.isSafeInteger(integerSizeBytes)
      ? BigInt(integerSizeBytes)
      : undefined;
  }
  if (typeof sizeBytes !== "string") {
    return undefined;
  }

  if (!/^\d+$/.test(sizeBytes)) {
    return undefined;
  }

  try {
    return BigInt(sizeBytes);
  } catch {
    return undefined;
  }
}
