/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ByteRangeCache,
  type ByteRange,
  type SampleLocation,
  classifyRangeResponse,
  parseContentRangeStart,
  RangeFetcher,
  rangeRequestHeader,
  sliceSampleBytes,
  spanByteRange,
} from "./videoByteRange";

/** A sample table: sizes chosen so offsets are easy to reason about. */
const SAMPLES: SampleLocation[] = [
  { offset: 100, size: 50 }, // [100, 150)
  { offset: 150, size: 20 }, // [150, 170)
  { offset: 170, size: 30 }, // [170, 200)
  { offset: 200, size: 10 }, // [200, 210)
];

describe("spanByteRange", () => {
  it("covers a single sample exactly", () => {
    expect(spanByteRange(SAMPLES, 0, 0)).toEqual({ start: 100, end: 150 });
  });

  it("covers a contiguous span from first offset to last end", () => {
    expect(spanByteRange(SAMPLES, 1, 3)).toEqual({ start: 150, end: 210 });
  });

  it("is order-agnostic in its index arguments", () => {
    expect(spanByteRange(SAMPLES, 3, 1)).toEqual({ start: 150, end: 210 });
  });

  it("clamps indices to the array bounds", () => {
    expect(spanByteRange(SAMPLES, -5, 99)).toEqual({ start: 100, end: 210 });
  });

  it("takes min offset / max end when samples are not offset-sorted", () => {
    const unsorted: SampleLocation[] = [
      { offset: 500, size: 10 }, // [500, 510)
      { offset: 100, size: 40 }, // [100, 140)
      { offset: 300, size: 10 }, // [300, 310)
    ];
    // Superset span across an out-of-order (interleaved) mdat.
    expect(spanByteRange(unsorted, 0, 2)).toEqual({ start: 100, end: 510 });
  });

  it("skips holes (missing entries) in the span", () => {
    const sparse = [
      { offset: 100, size: 50 },
      undefined,
      { offset: 200, size: 10 },
    ] as unknown as SampleLocation[];
    expect(spanByteRange(sparse, 0, 2)).toEqual({ start: 100, end: 210 });
  });

  it("returns null for an empty table", () => {
    expect(spanByteRange([], 0, 5)).toBeNull();
  });
});

describe("rangeRequestHeader", () => {
  it("formats an inclusive-end HTTP byte range", () => {
    // [150, 210) exclusive-end → bytes=150-209 inclusive-end.
    expect(rangeRequestHeader({ start: 150, end: 210 })).toBe("bytes=150-209");
  });

  it("formats a single-byte range", () => {
    expect(rangeRequestHeader({ start: 0, end: 1 })).toBe("bytes=0-0");
  });
});

describe("parseContentRangeStart", () => {
  it("reads the start offset from a well-formed header", () => {
    expect(parseContentRangeStart("bytes 200-999/12345")).toBe(200);
  });

  it("handles an unknown total size (`*`)", () => {
    expect(parseContentRangeStart("bytes 200-999/*")).toBe(200);
  });

  it("returns null for null / empty", () => {
    expect(parseContentRangeStart(null)).toBeNull();
    expect(parseContentRangeStart(undefined)).toBeNull();
    expect(parseContentRangeStart("")).toBeNull();
  });

  it("returns null for a non-byte or malformed unit", () => {
    expect(parseContentRangeStart("items 0-1/2")).toBeNull();
    expect(parseContentRangeStart("bytes */12345")).toBeNull();
  });
});

describe("classifyRangeResponse", () => {
  it("maps 206 to a range body", () => {
    expect(classifyRangeResponse(206)).toBe("range");
  });

  it("maps 200 to an ignored Range header", () => {
    expect(classifyRangeResponse(200)).toBe("ignored");
  });

  it("rejects any other status (e.g. 416, 500)", () => {
    expect(classifyRangeResponse(416)).toBe("rejected");
    expect(classifyRangeResponse(500)).toBe("rejected");
  });
});

describe("RangeFetcher", () => {
  const RANGE: ByteRange = { start: 100, end: 110 };

  /** A response stub whose body records whether it was cancelled. */
  const response = (status: number, contentRange?: string) => {
    const cancel = vi.fn(async () => undefined);
    return {
      status,
      headers: new Headers(
        contentRange ? { "Content-Range": contentRange } : {},
      ),
      body: { cancel },
      arrayBuffer: vi.fn(async () => new ArrayBuffer(10)),
      cancel,
    };
  };

  const fetcher = (request: (range: ByteRange) => Promise<unknown>) =>
    new RangeFetcher(
      request as (range: ByteRange) => Promise<Response>,
      new ByteRangeCache(1000),
    );

  it("serves a 206 body at the offset its Content-Range names", async () => {
    const request = vi.fn(async () => response(206, "bytes 96-109/500"));
    const ranges = fetcher(request);

    const span = await ranges.fetch(RANGE);

    expect(span.fileStart).toBe(96);
    expect(span.buffer.byteLength).toBe(10);
    // cached: the same range does not go back to the network
    await ranges.fetch(RANGE);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails on a 200 without reading the body, and fails fast after", async () => {
    const whole = response(200);
    const request = vi.fn(async () => whole);
    const ranges = fetcher(request);

    await expect(ranges.fetch(RANGE)).rejects.toThrow(
      /ignored the range request.*must support HTTP range requests/,
    );
    expect(whole.arrayBuffer).not.toHaveBeenCalled();
    expect(whole.cancel).toHaveBeenCalled();

    await expect(ranges.fetch({ start: 200, end: 210 })).rejects.toThrow(
      /must support HTTP range requests/,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails on any other status", async () => {
    const ranges = fetcher(async () => response(416));
    await expect(ranges.fetch(RANGE)).rejects.toThrow(/HTTP 416/);
  });

  it("fails when the request itself fails, and tries again on the next fetch", async () => {
    const request = vi
      .fn<(range: ByteRange) => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response(206, "bytes 100-109/500"));
    const ranges = fetcher(request);

    await expect(ranges.fetch(RANGE)).rejects.toThrow(
      /Failed to fetch.*must support HTTP range requests/,
    );
    expect((await ranges.fetch(RANGE)).fileStart).toBe(100);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("sliceSampleBytes", () => {
  /** A 20-byte buffer whose byte `i` holds value `i`. */
  const buf = (() => {
    const b = new Uint8Array(20);
    b.forEach((_, i) => (b[i] = i));
    return b.buffer;
  })();

  it("slices from a buffer at the start of the file", () => {
    const bytes = sliceSampleBytes(buf, 0, { offset: 4, size: 3 });
    expect(Array.from(bytes)).toEqual([4, 5, 6]);
  });

  it("slices from a 206 range buffer (nonzero fileStart)", () => {
    // Buffer covers file bytes [10, 30); sample at file offset 12.
    const bytes = sliceSampleBytes(buf, 10, { offset: 12, size: 2 });
    expect(Array.from(bytes)).toEqual([2, 3]);
  });

  it("throws when the sample starts before the buffer", () => {
    expect(() => sliceSampleBytes(buf, 10, { offset: 8, size: 2 })).toThrow(
      /outside/,
    );
  });

  it("throws when the sample runs past the buffer end", () => {
    expect(() => sliceSampleBytes(buf, 0, { offset: 18, size: 5 })).toThrow(
      /outside/,
    );
  });
});

describe("ByteRangeCache", () => {
  const r = (start: number, end: number): ByteRange => ({ start, end });
  const ab = (n: number): ArrayBuffer => new ArrayBuffer(n);

  it("misses then hits an exact range", () => {
    const cache = new ByteRangeCache(1000);
    expect(cache.get(r(0, 100))).toBeUndefined();

    const buffer = ab(100);
    cache.set(r(0, 100), buffer);
    expect(cache.get(r(0, 100))).toBe(buffer);
  });

  it("keys on the exact range (a different span misses)", () => {
    const cache = new ByteRangeCache(1000);
    cache.set(r(0, 100), ab(100));
    expect(cache.get(r(0, 99))).toBeUndefined();
    expect(cache.get(r(1, 100))).toBeUndefined();
  });

  it("tracks total bytes and entry count", () => {
    const cache = new ByteRangeCache(1000);
    cache.set(r(0, 100), ab(100));
    cache.set(r(100, 250), ab(150));
    expect(cache.sizeBytes).toBe(250);
    expect(cache.count).toBe(2);
  });

  it("evicts least-recently-used entries past the budget", () => {
    const cache = new ByteRangeCache(250);
    cache.set(r(0, 100), ab(100)); // LRU
    cache.set(r(100, 200), ab(100));
    cache.set(r(200, 300), ab(100)); // 300 > 250 → evict oldest (0-100)

    expect(cache.get(r(0, 100))).toBeUndefined();
    expect(cache.get(r(100, 200))).toBeDefined();
    expect(cache.get(r(200, 300))).toBeDefined();
    expect(cache.sizeBytes).toBe(200);
  });

  it("a hit refreshes recency so a later insert evicts the other entry", () => {
    const cache = new ByteRangeCache(250);
    cache.set(r(0, 100), ab(100));
    cache.set(r(100, 200), ab(100));

    // Touch the older entry → now (100,200) is the LRU.
    expect(cache.get(r(0, 100))).toBeDefined();

    cache.set(r(200, 300), ab(100)); // evicts LRU = (100,200)
    expect(cache.get(r(0, 100))).toBeDefined();
    expect(cache.get(r(100, 200))).toBeUndefined();
    expect(cache.get(r(200, 300))).toBeDefined();
  });

  it("replacing a key updates size without double-counting", () => {
    const cache = new ByteRangeCache(1000);
    cache.set(r(0, 100), ab(100));
    cache.set(r(0, 100), ab(60));
    expect(cache.count).toBe(1);
    expect(cache.sizeBytes).toBe(60);
    expect(cache.get(r(0, 100))?.byteLength).toBe(60);
  });

  it("declines to cache a buffer larger than the whole budget", () => {
    const cache = new ByteRangeCache(100);
    cache.set(r(0, 200), ab(200));
    expect(cache.get(r(0, 200))).toBeUndefined();
    expect(cache.sizeBytes).toBe(0);
    expect(cache.count).toBe(0);
  });
});
