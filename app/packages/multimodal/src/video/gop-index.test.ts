import { describe, expect, it, vi } from "vitest";

import type { EncodedH264VideoVisualization } from "../ir";
import { VISUALIZATION_KIND } from "../ir";
import { EncodedAccessUnitCache, VideoGopIndex } from "./gop-index";
import type { H264AccessUnit } from "./types";

describe("VideoGopIndex", () => {
  it("recomputes configuration epochs after out-of-order discovery", () => {
    const index = new VideoGopIndex();
    index.observe(unit(0, true, "avc1.a"));
    index.observe(unit(20, true, "avc1.a"));
    expect(index.sameEpoch(0n, 20n)).toBe(true);

    index.observe(unit(10, true, "avc1.b"));
    expect(index.sameEpoch(0n, 20n)).toBe(false);
    expect(index.sameEpoch(10n, 20n)).toBe(false);
  });

  it("bounds the sorted keyframe working set around recent observations", () => {
    const index = new VideoGopIndex(2);
    index.observe(unit(0, true));
    index.observe(unit(10, true));
    index.observe(unit(20, true));

    expect(index.keyframeTimeAtOrBefore(5n)).toBeNull();
    expect(index.keyframeTimeAtOrBefore(20n)).toBe(20n);
  });

  it("drops the far future when an early historical keyframe is discovered", () => {
    const index = new VideoGopIndex(2);
    index.observe(unit(10, true));
    index.observe(unit(20, true));
    index.observe(unit(0, true));

    expect(index.keyframeTimeAtOrBefore(20n)).toBe(10n);
    expect(index.keyframeTimeAtOrBefore(0n)).toBe(0n);
  });

  it("invalidates searched coverage when encoded data is evicted", () => {
    const index = new VideoGopIndex();
    index.recordReadCoverage(0n, 10n, []);
    expect(index.deepestKnownKeyframeFreeStart(5n)).toBe(0n);
    index.invalidateCoverage();
    expect(index.deepestKnownKeyframeFreeStart(5n)).toBeNull();
    expect(index.covers(0n, 10n)).toBe(false);
  });
});

describe("EncodedAccessUnitCache", () => {
  it("returns timestamp-sorted ranges and refreshes their LRU recency", () => {
    const onEvict = vi.fn();
    const cache = new EncodedAccessUnitCache(10, onEvict);
    const first = unit(1);
    const second = unit(2);
    const third = unit(3);
    cache.put(second);
    cache.put(first);
    expect(cache.range(1n, 1n)).toEqual([first]);

    cache.put(third);
    expect(onEvict).toHaveBeenCalledWith(2n);
    expect(cache.has(1n)).toBe(true);
    expect(cache.has(2n)).toBe(false);
    expect(cache.range(0n, 5n)).toEqual([first, third]);
  });

  it("replaces timestamps once and rejects an oversize replacement", () => {
    const onEvict = vi.fn();
    const cache = new EncodedAccessUnitCache(10, onEvict);
    const original = unit(1);
    const replacement: H264AccessUnit = {
      ...unit(1),
      frame: { ...unit(1).frame, bytes: Uint8Array.of(9, 8, 7) },
    };
    cache.put(original);
    cache.put(replacement);

    expect(onEvict).not.toHaveBeenCalled();
    expect(cache.retainedBytes).toBe(3);
    expect(cache.range(1n, 1n)).toEqual([replacement]);

    onEvict.mockClear();
    const oversize: H264AccessUnit = {
      ...replacement,
      frame: { ...replacement.frame, bytes: new Uint8Array(11) },
    };
    cache.put(oversize);
    expect(cache.has(1n)).toBe(false);
    expect(cache.retainedBytes).toBe(0);
    expect(onEvict).toHaveBeenCalledWith(1n);
  });

  it("reports every retained timestamp when cleared", () => {
    const onEvict = vi.fn();
    const cache = new EncodedAccessUnitCache(20, onEvict);
    cache.put(unit(1));
    cache.put(unit(2));
    cache.clear();
    expect(onEvict.mock.calls.map(([timeNs]) => timeNs)).toEqual([1n, 2n]);
  });
});

function unit(
  time: number,
  keyframe = false,
  codecString = "avc1.a",
): H264AccessUnit {
  const timeNs = BigInt(time);
  return {
    frame: {
      bytes: Uint8Array.of(0, 0, 1, keyframe ? 0x65 : 0x41, time),
      codec: "h264",
      format: "h264",
      h264: keyframe
        ? {
            codecString,
            hasFrame: true,
            pps: Uint8Array.of(
              0x68,
              codecString.charCodeAt(codecString.length - 1),
            ),
            sps: Uint8Array.of(
              0x67,
              codecString.charCodeAt(codecString.length - 1),
            ),
          }
        : { hasFrame: true },
      keyframe,
      kind: VISUALIZATION_KIND.ENCODED_VIDEO,
      timestampNs: timeNs,
    } satisfies EncodedH264VideoVisualization,
    timeNs,
  };
}
