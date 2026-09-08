import { describe, expect, it } from "vitest";
import { createAdaptiveByteCacheBlockSize } from "./adaptive-block-size";
import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import type { ByteRangeReadRequest, ByteReadDebugLog } from "./types";

describe("createAdaptiveByteCacheBlockSize", () => {
  it("keeps profile defaults before any observations", () => {
    const adaptive = createAdaptiveByteCacheBlockSize();

    expect(adaptive.blockSizeBytes(request("local"))).toBe(
      DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
    expect(adaptive.blockSizeBytes(request("remote"))).toBe(
      DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
  });

  it("stays at the local size while small fetches are fast", () => {
    const adaptive = createAdaptiveByteCacheBlockSize();

    for (let index = 0; index < 10; index += 1) {
      adaptive.onRead(read({ durationMs: 3 }));
    }

    expect(adaptive.blockSizeBytes(request("local"))).toBe(
      DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
  });

  it("promotes a slow local-profile source to the remote size", () => {
    const adaptive = createAdaptiveByteCacheBlockSize();

    for (let index = 0; index < 4; index += 1) {
      adaptive.onRead(read({ durationMs: 120 }));
    }

    expect(adaptive.blockSizeBytes(request("local"))).toBe(
      DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
    // Other sources keep their own estimate.
    expect(adaptive.blockSizeBytes(request("local", "other-source"))).toBe(
      DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
  });

  it("latches promotion even if later reads are fast", () => {
    const adaptive = createAdaptiveByteCacheBlockSize();

    for (let index = 0; index < 4; index += 1) {
      adaptive.onRead(read({ durationMs: 120 }));
    }
    for (let index = 0; index < 50; index += 1) {
      adaptive.onRead(read({ durationMs: 1 }));
    }

    expect(adaptive.blockSizeBytes(request("local"))).toBe(
      DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
  });

  it("ignores cache hits and transfer-dominated large fetches", () => {
    const adaptive = createAdaptiveByteCacheBlockSize();

    for (let index = 0; index < 10; index += 1) {
      adaptive.onRead(
        read({ cacheResult: "fill-hit", durationMs: 500, fetchedBytes: 0 }),
      );
      adaptive.onRead(read({ durationMs: 500, fetchedBytes: 8 * 1024 * 1024 }));
    }

    expect(adaptive.blockSizeBytes(request("local"))).toBe(
      DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
    );
  });
});

function request(
  profile: "local" | "remote",
  sourceId = "sample-1",
): ByteRangeReadRequest {
  return {
    range: { length: 1024n, offset: 0n },
    source: {
      readProfile:
        profile === "remote"
          ? BYTE_SOURCE_READ_PROFILE.REMOTE
          : BYTE_SOURCE_READ_PROFILE.LOCAL,
      sizeBytes: "1000000",
      sourceId,
      url: "https://example.test/media",
    },
  };
}

function read(overrides: Partial<ByteReadDebugLog>): ByteReadDebugLog {
  return {
    blockFill: true,
    cacheResult: "fetched",
    durationMs: 10,
    fetchedBytes: 64 * 1024,
    fillLength: "65536",
    fillOffset: "0",
    readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
    requestedLength: "1024",
    requestedOffset: "0",
    returnedBytes: 1024,
    sourceId: "sample-1",
    ...overrides,
  };
}
