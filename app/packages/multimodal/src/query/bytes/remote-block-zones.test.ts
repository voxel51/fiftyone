import { describe, expect, it } from "vitest";
import { createZonedRemoteBlockSize } from "./remote-block-zones";
import { BYTE_SOURCE_READ_PROFILE } from "./constants";
import type { ByteRangeReadRequest } from "./types";

const MB = 1024 * 1024;

function request(offset: bigint, sizeBytes?: string): ByteRangeReadRequest {
  return {
    range: { length: 1024n, offset },
    source: {
      readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
      sourceId: "source-a",
      url: "https://bytes.example/a.mcap",
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    },
  };
}

describe("createZonedRemoteBlockSize", () => {
  const size200MB = String(200 * MB);
  const zoned = createZonedRemoteBlockSize(() => 32 * MB);

  it("serves the head zone small and the body large", () => {
    expect(zoned(request(0n, size200MB))).toBe(8 * MB);
    expect(zoned(request(BigInt(63 * MB), size200MB))).toBe(8 * MB);
    expect(zoned(request(BigInt(64 * MB), size200MB))).toBe(32 * MB);
    expect(zoned(request(BigInt(90 * MB), size200MB))).toBe(32 * MB);
  });

  it("serves the tail zone small, aligned to the large-block grid", () => {
    // tail start = floor((200MB - 64MB) / 32MB) * 32MB = 128MB
    expect(zoned(request(BigInt(127 * MB), size200MB))).toBe(32 * MB);
    expect(zoned(request(BigInt(128 * MB), size200MB))).toBe(8 * MB);
    expect(zoned(request(BigInt(199 * MB), size200MB))).toBe(8 * MB);
  });

  it("stays small while the source size is unknown", () => {
    expect(zoned(request(BigInt(80 * MB)))).toBe(8 * MB);
  });

  it("passes small base sizes through untouched", () => {
    const local = createZonedRemoteBlockSize(2 * MB);
    expect(local(request(BigInt(80 * MB), size200MB))).toBe(2 * MB);
  });
});
