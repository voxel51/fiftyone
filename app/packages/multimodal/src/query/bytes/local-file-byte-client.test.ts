import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  BYTE_SOURCE_READ_PROFILE,
  createCachedByteClient,
  createMemoryByteRangeCache,
  type ByteRangeCache,
  type ByteSourceDescriptor,
} from "./index";
import { createDefaultByteClient } from "./default-byte-client";
import { createLocalFileByteClient } from "./local-file-byte-client";

describe("createLocalFileByteClient", () => {
  it("stats the browser File without reading bytes", async () => {
    const file = createFile([1, 2, 3, 4]);
    const source = createSource(file);
    const client = createLocalFileByteClient();

    await expect(client.stat?.(source)).resolves.toEqual({
      ...source,
      sizeBytes: "4",
    });
  });

  it("honors an already-aborted stat signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createLocalFileByteClient();

    await expect(
      client.stat?.(createSource(createFile([1])), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads the exact requested byte range", async () => {
    const file = createFile([1, 2, 3, 4]);
    const source = createSource(file);
    const client = createLocalFileByteClient();

    const result = await client.readBytes({
      range: { length: 2n, offset: 1n },
      source,
    });

    expect([...result.bytes]).toEqual([2, 3]);
    expect(result.range).toEqual({ length: 2n, offset: 1n });
    expect(result.source).toEqual({ ...source, sizeBytes: "4" });
  });

  it("rejects invalid ranges", async () => {
    const source = createSource(createFile([1, 2, 3, 4]));
    const client = createLocalFileByteClient();

    await expect(
      client.readBytes({
        range: { length: 1n, offset: -1n },
        source,
      }),
    ).rejects.toThrow("offset must be non-negative");

    await expect(
      client.readBytes({
        range: { length: 0n, offset: 0n },
        source,
      }),
    ).rejects.toThrow("length must be positive");
  });

  it("rejects reads beyond EOF", async () => {
    const source = createSource(createFile([1, 2, 3, 4]));
    const client = createLocalFileByteClient();

    await expect(
      client.readBytes({
        range: { length: 2n, offset: 3n },
        source,
      }),
    ).rejects.toThrow("exceeds file size 4");
  });

  it("validates that the browser returned the exact byte count", async () => {
    const shortFile = {
      size: 4,
      slice: () => new Blob([new Uint8Array([1, 2])]),
    } as unknown as File;
    const source = createSource(shortFile);
    const client = createLocalFileByteClient();

    await expect(
      client.readBytes({
        range: { length: 4n, offset: 0n },
        source,
      }),
    ).rejects.toThrow("Expected 4 bytes but received 2");
  });

  it("honors an already-aborted read signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = createSource(createFile([1, 2, 3, 4]));
    const client = createLocalFileByteClient();

    const error = await client
      .readBytes({
        range: { length: 1n, offset: 0n },
        signal: controller.signal,
        source,
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: "File byte-range read aborted",
      name: "AbortError",
    });
    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).stack).toContain("local-file-byte-client.ts");
  });
});

describe("createDefaultByteClient", () => {
  it("routes local File-backed sources to the local file reader", async () => {
    const file = createFile([9, 8, 7]);
    const source = createSource(file);
    const client = createDefaultByteClient();

    const result = await client.readBytes({
      range: { length: 2n, offset: 0n },
      source,
    });

    expect([...result.bytes]).toEqual([9, 8]);
  });

  it("does not persist local file bytes beyond the in-memory cache", async () => {
    const file = createFile([9, 8, 7]);
    const source = { ...createSource(file), sizeBytes: String(file.size) };
    const persistent = createRecordingCache();
    const client = createCachedByteClient(createDefaultByteClient(), {
      memory: createMemoryByteRangeCache({ maxSizeBytes: 1024 }),
      persistent,
    });

    await client.readBytes({
      range: { length: 2n, offset: 0n },
      source,
    });

    expect(persistent.get).not.toHaveBeenCalled();
    expect(persistent.put).not.toHaveBeenCalled();
  });
});

function createSource(file: File): ByteSourceDescriptor {
  return {
    localFile: file,
    readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
    sourceId: `local-file:${file.name}:${file.size}:${file.lastModified}`,
    url: `local-file:${file.name}:${file.size}:${file.lastModified}`,
  };
}

function createFile(bytes: readonly number[]): File {
  return new File([new Uint8Array(bytes)], "test.mcap", {
    lastModified: 1,
    type: "application/octet-stream",
  });
}

function createRecordingCache(): ByteRangeCache {
  return {
    clear: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
}
