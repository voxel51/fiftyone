/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type KeyValueStore, NativeDecodeCache } from "./nativeDecodeCache";

/** Map-backed `KeyValueStore` for asserting persistence. */
class FakeStore implements KeyValueStore {
  readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("NativeDecodeCache — sample verdicts", () => {
  let store: FakeStore;
  let cache: NativeDecodeCache;

  beforeEach(() => {
    store = new FakeStore();
    cache = new NativeDecodeCache(store);
  });

  it("returns undefined for an unknown sample", () => {
    expect(cache.getSampleVerdict("ds", "s1")).toBeUndefined();
  });

  it("round-trips a verdict through memory", () => {
    cache.setSampleVerdict("ds", "s1", {
      codec: "avc1.64000d",
      decodable: true,
    });
    expect(cache.getSampleVerdict("ds", "s1")).toEqual({
      codec: "avc1.64000d",
      decodable: true,
    });
  });

  it("persists a verdict so a fresh cache over the same store reads it", () => {
    cache.setSampleVerdict("ds", "s1", { codec: "vp09", decodable: false });

    const reloaded = new NativeDecodeCache(store);
    expect(reloaded.getSampleVerdict("ds", "s1")).toEqual({
      codec: "vp09",
      decodable: false,
    });
  });

  it("scopes verdicts by dataset + sample id", () => {
    cache.setSampleVerdict("ds", "s1", { codec: "avc1", decodable: true });
    expect(cache.getSampleVerdict("ds", "s2")).toBeUndefined();
    expect(cache.getSampleVerdict("other", "s1")).toBeUndefined();
  });

  it("ignores corrupt persisted JSON", () => {
    store.setItem("fo:nd:v1:sample:ds:s1", "{not json");
    expect(cache.getSampleVerdict("ds", "s1")).toBeUndefined();
  });

  it("ignores a persisted value with the wrong shape", () => {
    store.setItem("fo:nd:v1:sample:ds:s1", JSON.stringify({ codec: 5 }));
    expect(cache.getSampleVerdict("ds", "s1")).toBeUndefined();
  });
});

describe("NativeDecodeCache — codec support", () => {
  let store: FakeStore;
  let cache: NativeDecodeCache;

  beforeEach(() => {
    store = new FakeStore();
    cache = new NativeDecodeCache(store);
  });

  it("returns undefined for an unknown codec", () => {
    expect(cache.getCodecSupport("avc1.64000d")).toBeUndefined();
  });

  it("round-trips and persists codec support", () => {
    cache.setCodecSupport("avc1.64000d", true);
    expect(cache.getCodecSupport("avc1.64000d")).toBe(true);
    expect(new NativeDecodeCache(store).getCodecSupport("avc1.64000d")).toBe(
      true,
    );
  });

  it("distinguishes false from unknown", () => {
    cache.setCodecSupport("hev1", false);
    expect(cache.getCodecSupport("hev1")).toBe(false);
  });

  it("back-fills codec support from a sample verdict", () => {
    cache.setSampleVerdict("ds", "s1", {
      codec: "avc1.64000d",
      decodable: true,
    });
    // A sibling sample with the same codec is answerable without its own probe.
    expect(cache.getCodecSupport("avc1.64000d")).toBe(true);
  });
});

describe("NativeDecodeCache — memory-only (no store)", () => {
  it("works without a backing store", () => {
    const cache = new NativeDecodeCache(null);
    cache.setSampleVerdict("ds", "s1", { codec: "avc1", decodable: true });
    expect(cache.getSampleVerdict("ds", "s1")).toEqual({
      codec: "avc1",
      decodable: true,
    });
  });

  it("degrades to memory-only when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    const cache = new NativeDecodeCache(throwing);
    cache.setCodecSupport("avc1", true);
    // The write threw and was swallowed, but the in-memory memo still answers.
    expect(cache.getCodecSupport("avc1")).toBe(true);
  });
});
