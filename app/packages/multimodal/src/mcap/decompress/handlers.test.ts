import { beforeEach, describe, expect, it, vi } from "vitest";

const support = vi.hoisted(() => {
  const lz4 = vi.fn((buffer: Uint8Array) => buffer);
  const zstd = vi.fn((buffer: Uint8Array) => buffer);
  const lz4Module = Object.assign(lz4, { isLoaded: Promise.resolve() });

  return {
    lz4,
    lz4Module,
    zstd,
    zstdModule: {
      decompress: zstd,
      isLoaded: Promise.resolve(),
    },
  };
});

vi.mock("@foxglove/wasm-lz4", () => ({
  default: support.lz4Module,
}));

vi.mock("@foxglove/wasm-zstd", () => ({
  ...support.zstdModule,
  default: support.zstdModule,
}));

describe("MCAP decompress handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    support.lz4.mockClear();
    support.zstd.mockClear();
  });

  it("delegates supported codecs through Foxglove WASM packages", async () => {
    const { loadMcapDecompressHandlers } = await import("./handlers");
    const handlers = await loadMcapDecompressHandlers();
    const buffer = new Uint8Array([1, 2, 3]);
    const lz4Result = handlers.lz4(buffer, 3n);
    const zstdResult = handlers.zstd(buffer, 3n);

    expect(Object.keys(handlers).sort()).toEqual(["lz4", "zstd"]);
    expect(lz4Result).toEqual(buffer);
    expect(zstdResult).toEqual(buffer);
    expect(lz4Result).toBe(buffer);
    expect(zstdResult).toBe(buffer);
    expect(support.lz4).toHaveBeenCalledWith(buffer, 3);
    expect(support.zstd).toHaveBeenCalledWith(buffer, 3);
  });

  it("rejects invalid decompressed sizes before delegating", async () => {
    const { loadMcapDecompressHandlers } = await import("./handlers");
    const handlers = await loadMcapDecompressHandlers();
    const buffer = new Uint8Array([1, 2, 3]);

    expect(() => handlers.lz4(buffer, -1n)).toThrow(
      "negative decompressed size"
    );
    expect(() =>
      handlers.zstd(buffer, BigInt(Number.MAX_SAFE_INTEGER) + 1n)
    ).toThrow("too large to decompress in the browser");
    expect(support.lz4).not.toHaveBeenCalled();
    expect(support.zstd).not.toHaveBeenCalled();
  });
});
