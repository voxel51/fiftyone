import { describe, expect, it } from "vitest";

import { createCachedByteClient } from "./cached-byte-client";
import { createMemoryByteRangeCache } from "./cache";
import { BYTE_SOURCE_READ_PROFILE } from "./constants";
import { byteFillLockName } from "./fill-lock";
import type {
  ByteClient,
  ByteRangeCache,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteSourceDescriptor,
} from "./types";

const MEMORY_CACHE_BYTES = 8 * 1024 * 1024;
const BLOCK_SIZE_BYTES = 64 * 1024;
const OBJECT_SIZE_BYTES = 4 * BLOCK_SIZE_BYTES;

/**
 * A manifest derived from a stored reference carries no size, because import
 * records none. This is the shape every LeRobot asset arrives in.
 */
function unsizedSource(
  overrides: Partial<ByteSourceDescriptor> = {},
): ByteSourceDescriptor {
  return {
    contentId: "object:video-1",
    readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
    sourceId: "episode-0:video",
    url: "https://store.example/video.mp4",
    ...overrides,
  };
}

function read(
  overrides: Partial<ByteRangeReadRequest> = {},
): ByteRangeReadRequest {
  return {
    range: { length: 4096n, offset: 0n },
    source: unsizedSource(),
    ...overrides,
  };
}

/**
 * Answers every range, and reports the object's total length the way an HTTP
 * range response does - which is the only place an unsized source can learn
 * it. Records the physical ranges it was actually asked for.
 */
function createStubReader(sizeBytes = OBJECT_SIZE_BYTES): ByteClient & {
  readonly reads: ByteRangeReadRequest["range"][];
} {
  const reads: ByteRangeReadRequest["range"][] = [];
  return {
    reads,
    async readBytes(request): Promise<ByteRangeReadResult> {
      reads.push(request.range);
      const end =
        request.range.offset + request.range.length > BigInt(sizeBytes)
          ? BigInt(sizeBytes)
          : request.range.offset + request.range.length;
      return {
        bytes: new Uint8Array(Number(end - request.range.offset)).fill(3),
        range: {
          length: end - request.range.offset,
          offset: request.range.offset,
        },
        source: { ...request.source, sizeBytes: String(sizeBytes) },
      };
    },
  };
}

function createSpyPersistentCache(): ByteRangeCache & {
  readonly writes: ByteRangeReadRequest["range"][];
} {
  const inner = createMemoryByteRangeCache({
    maxSizeBytes: MEMORY_CACHE_BYTES,
  });
  const writes: ByteRangeReadRequest["range"][] = [];
  return {
    writes,
    clear: () => inner.clear(),
    get: (request) => inner.get(request),
    async put(result) {
      writes.push(result.range);
      await inner.put(result);
    },
  };
}

/** Whether any recorded write covers exactly one block at this offset. */
function wroteBlockAt(
  writes: readonly ByteRangeReadRequest["range"][],
  offset: bigint,
): boolean {
  return writes.some(
    (range) =>
      range.offset === offset && range.length === BigInt(BLOCK_SIZE_BYTES),
  );
}

function createClient(
  reader: ByteClient,
  persistent?: ByteRangeCache,
): ByteClient {
  return createCachedByteClient(reader, {
    blockSizeBytes: BLOCK_SIZE_BYTES,
    memory: createMemoryByteRangeCache({ maxSizeBytes: MEMORY_CACHE_BYTES }),
    ...(persistent ? { persistent } : {}),
  });
}

/** Lets a queued readahead fill run before the assertions. */
async function settleReadahead(): Promise<void> {
  for (let tick = 0; tick < 8; tick++) {
    await Promise.resolve();
  }
}

describe("byte reads of a source the manifest did not size", () => {
  it("widens a later read to a block fill", async () => {
    // Without the size, the planner cannot find a block's end and leaves
    // every read at its exact shape: one request per demuxer read, which is
    // what a remote object store cannot serve fast enough to feed playback.
    const reader = createStubReader();
    const client = createClient(reader);

    await client.readBytes(read({ range: { length: 4096n, offset: 0n } }));
    await client.readBytes(
      read({ range: { length: 4096n, offset: BigInt(BLOCK_SIZE_BYTES) } }),
    );

    expect(reader.reads).toContainEqual({
      length: BigInt(BLOCK_SIZE_BYTES),
      offset: BigInt(BLOCK_SIZE_BYTES),
    });
    expect(reader.reads).not.toContainEqual({
      length: 4096n,
      offset: BigInt(BLOCK_SIZE_BYTES),
    });
  });

  it("queues successor readahead once a read has reported the size", async () => {
    const reader = createStubReader();
    const client = createClient(reader);

    await client.readBytes(read({ range: { length: 4096n, offset: 0n } }));
    await client.readBytes(
      read({ range: { length: 4096n, offset: BigInt(BLOCK_SIZE_BYTES) } }),
    );
    await settleReadahead();

    expect(reader.reads).toContainEqual({
      length: BigInt(BLOCK_SIZE_BYTES),
      offset: BigInt(2 * BLOCK_SIZE_BYTES),
    });
  });

  it("sizes the source for every other consumer of the same content", async () => {
    // Every episode of a LeRobot source reads the same video file under its
    // own asset id, so one episode's first read must size it for the rest.
    const reader = createStubReader();
    const client = createClient(reader);

    await client.readBytes(read({ range: { length: 4096n, offset: 0n } }));
    await client.readBytes(
      read({
        range: { length: 4096n, offset: BigInt(BLOCK_SIZE_BYTES) },
        source: unsizedSource({ sourceId: "episode-7:video" }),
      }),
    );

    expect(reader.reads).toContainEqual({
      length: BigInt(BLOCK_SIZE_BYTES),
      offset: BigInt(BLOCK_SIZE_BYTES),
    });
  });

  it("files the widened block, not the caller's range, in the persistent cache", async () => {
    const reader = createStubReader();
    const persistent = createSpyPersistentCache();
    const client = createClient(reader, persistent);

    await client.readBytes(read({ range: { length: 4096n, offset: 0n } }));
    await client.readBytes(
      read({ range: { length: 4096n, offset: BigInt(BLOCK_SIZE_BYTES) } }),
    );

    expect(wroteBlockAt(persistent.writes, BigInt(BLOCK_SIZE_BYTES))).toBe(
      true,
    );
  });

  it("keeps an exact-read caller exact after the size is known", async () => {
    // A container header walked from the front asks for exact ranges. Widened
    // to the block size it would fetch megabytes to read a header.
    const reader = createStubReader();
    const client = createClient(reader);

    await client.readBytes(read({ range: { length: 4096n, offset: 0n } }));
    await client.readBytes(
      read({
        cachePolicy: { blockFill: false },
        range: { length: 1n, offset: BigInt(BLOCK_SIZE_BYTES) },
      }),
    );

    expect(reader.reads[1]).toEqual({
      length: 1n,
      offset: BigInt(BLOCK_SIZE_BYTES),
    });
  });
});

describe("byteFillLockName", () => {
  it("names one fill shape whether or not its size has been discovered", () => {
    // The lock and the persistent entry it hands off must have the same
    // identity, or the context that has learned the size and the one that has
    // not each fetch, then each write the entry they were meant to share.
    const range = { length: 8n, offset: 0n };

    expect(
      byteFillLockName({ range, source: unsizedSource({ sizeBytes: "4096" }) }),
    ).toBe(byteFillLockName({ range, source: unsizedSource() }));
  });
});
