import { describe, expect, it, vi } from "vitest";
import type { DecodedFrame } from "../ir";
import { EpisodeStreamCache } from "./episode-stream-cache";
import { createTimelineIndex } from "./timeline-index";

const MESSAGE = {
  output: { resourceHints: { sizeBytes: 128 } },
  streamId: "stream",
  timestampNs: 1n,
} satisfies DecodedFrame;

describe("EpisodeStreamCache", () => {
  it("publishes revision changes when cached tick contents change", () => {
    const cache = new EpisodeStreamCache();
    const listener = vi.fn();
    const unsubscribe = cache.subscribeToChanges(listener);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    cache.set(1n, null);
    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    cache.set(2n, MESSAGE);
    expect(cache.revision).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("bumps revision when a distinct message replaces the same tick", () => {
    const cache = new EpisodeStreamCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);

    // A new object with equivalent contents for the same tick is the path that
    // drives re-renders during re-fetch — identity differs from the cached
    // entry, so it must bump even though an entry already exists.
    cache.set(1n, { ...MESSAGE });
    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("publishes when clear removes cached entries", () => {
    const cache = new EpisodeStreamCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    cache.clear();
    expect(cache.revision).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    cache.set(1n, MESSAGE);
    cache.clear();

    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears and publishes when the final active subscriber leaves", () => {
    const cache = new EpisodeStreamCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    const release = cache.subscribe();
    cache.set(1n, MESSAGE);
    release();

    expect(cache.revision).toBe(2);
    expect(cache.get(1n)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("guards against a double release clearing the cache while another subscriber is active", () => {
    const cache = new EpisodeStreamCache();
    const releaseA = cache.subscribe();
    const releaseB = cache.subscribe();
    expect(cache.isActive).toBe(true);

    releaseA();
    // StrictMode can fire the same cleanup twice; the second call must be a
    // no-op rather than decrementing again (which would drop to 0 and clear
    // while releaseB still holds the cache).
    releaseA();
    expect(cache.isActive).toBe(true);

    releaseB();
    expect(cache.isActive).toBe(false);
  });

  it("resizes placement capacity without losing subscribers or listeners", () => {
    const cache = new EpisodeStreamCache(3);
    const listener = vi.fn();
    cache.subscribeToChanges(listener);
    const release = cache.subscribe();
    cache.set(1n, MESSAGE);
    cache.set(2n, { ...MESSAGE, recordId: "second", timestampNs: 2n });
    cache.set(3n, { ...MESSAGE, recordId: "third", timestampNs: 3n });

    cache.resize(2);

    expect(cache.isActive).toBe(true);
    expect(cache.stats().entryCount).toBe(2);
    expect(cache.get(1n)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(4);
    release();
  });

  it("keeps every placement inside the same LRU capacity", () => {
    const cache = new EpisodeStreamCache(2);

    cache.set(0n, null);
    cache.set(1n, null);
    cache.set(2n, null);

    expect(cache.has(0n)).toBe(false);
    expect(cache.has(1n)).toBe(true);
    expect(cache.has(2n)).toBe(true);
    expect(cache.stats().entryCount).toBe(2);
  });

  it("counts one decoded message once across multiple tick placements", () => {
    const cache = new EpisodeStreamCache();

    cache.set(1n, MESSAGE);
    cache.set(2n, MESSAGE);
    cache.set(3n, MESSAGE);

    expect(cache.stats()).toMatchObject({
      decodedBytes: 128,
      entryCount: 3,
    });
    expect(cache.stats().placementBytes).toBeGreaterThan(0);
    expect(cache.stats().accountedBytes).toBeGreaterThan(128);

    const beforePrunePlacementBytes = cache.stats().placementBytes;
    cache.pruneOutsideRanges([{ endTick: 3n, startTick: 3n }]);
    expect(cache.stats().decodedBytes).toBe(128);
    expect(cache.stats().entryCount).toBe(1);
    expect(cache.stats().placementBytes).toBeLessThan(
      beforePrunePlacementBytes,
    );

    cache.clear();
    expect(cache.stats()).toMatchObject({
      decodedBytes: 0,
      entryCount: 0,
    });
    expect(cache.stats().accountedBytes).toBe(0);
  });

  it("enumerates each live transferable backing store once", () => {
    const cache = new EpisodeStreamCache();
    const first = new ArrayBuffer(16);
    const second = new ArrayBuffer(32);
    const message = {
      ...MESSAGE,
      output: {
        resourceHints: {
          sizeBytes: 48,
          transferables: [first, second, first],
        },
      },
    } satisfies DecodedFrame;

    cache.set(1n, message);
    cache.set(2n, message);

    expect(cache.transferableBuffers()).toEqual([first, second]);
    cache.clear();
    expect(cache.transferableBuffers()).toEqual([]);
  });

  it("canonicalizes equivalent indexed artifacts while the record is resident", () => {
    const cache = new EpisodeStreamCache();
    const first = { ...MESSAGE, recordId: "record:1" };
    const duplicate = { ...MESSAGE, recordId: "record:1" };

    expect(cache.set(1n, first)).toEqual({
      avoidedDecodedBytes: 0,
      canonicalized: false,
      canonicalEligible: true,
    });
    expect(cache.set(2n, duplicate)).toEqual({
      avoidedDecodedBytes: 128,
      canonicalized: true,
      canonicalEligible: true,
    });

    expect(cache.get(2n)).toBe(first);
    expect(cache.stats().decodedBytes).toBe(128);
  });

  it("forgets canonical identity after its final placement is released", () => {
    const cache = new EpisodeStreamCache(1);
    const first = { ...MESSAGE, recordId: "record:1" };
    const replacement = {
      ...MESSAGE,
      recordId: "record:2",
      timestampNs: 2n,
    };
    const reloaded = { ...MESSAGE, recordId: "record:1" };

    cache.set(1n, first);
    cache.set(2n, replacement);
    expect(cache.set(3n, reloaded).canonicalized).toBe(false);
    expect(cache.get(3n)).toBe(reloaded);
  });

  it("does not canonicalize frames without a collision-safe record id", () => {
    const cache = new EpisodeStreamCache();
    const duplicate = { ...MESSAGE };

    cache.set(1n, MESSAGE);
    expect(cache.set(2n, duplicate)).toEqual({
      avoidedDecodedBytes: 0,
      canonicalized: false,
      canonicalEligible: false,
    });
    expect(cache.get(2n)).toBe(duplicate);
    expect(cache.stats().decodedBytes).toBe(256);
  });

  it("releases unique decoded bytes on replacement, LRU eviction, and clear", () => {
    const cache = new EpisodeStreamCache(1);
    const second = {
      ...MESSAGE,
      output: {
        ...MESSAGE.output,
        resourceHints: { sizeBytes: 256 },
      },
    };

    cache.set(1n, MESSAGE);
    expect(cache.stats().decodedBytes).toBe(128);

    cache.set(2n, second);
    expect(cache.stats()).toMatchObject({
      decodedBytes: 256,
      entryCount: 1,
    });

    cache.set(2n, MESSAGE);
    expect(cache.stats().decodedBytes).toBe(128);

    cache.clear();
    expect(cache.stats().decodedBytes).toBe(0);
  });

  it("prunes outside disjoint playback-order runways", () => {
    const cache = new EpisodeStreamCache();
    cache.set(1n, MESSAGE);
    cache.set(2n, MESSAGE);
    cache.set(3n, MESSAGE);
    cache.set(4n, MESSAGE);

    expect(
      cache.pruneOutsideRanges([
        { endTick: 2n, startTick: 2n },
        { endTick: 4n, startTick: 4n },
      ]),
    ).toBe(2);
    expect(cache.has(1n)).toBe(false);
    expect(cache.has(2n)).toBe(true);
    expect(cache.has(3n)).toBe(false);
    expect(cache.has(4n)).toBe(true);
    expect(cache.stats().decodedBytes).toBe(128);
  });

  it("derives temporal limits from the messages observed by the stream", () => {
    const cache = new EpisodeStreamCache();
    const cadenceNs = 200_000_000n;
    for (let index = 0; index < 4; index += 1) {
      cache.set(BigInt(index), {
        ...MESSAGE,
        timestampNs: BigInt(index) * cadenceNs,
      });
    }

    expect(cache.observationStaleThresholdNs()).toBe(600_000_000n);
    expect(cache.interpolationGapLimitNs()).toBe(600_000_000n);

    cache.clear();
    expect(cache.observationStaleThresholdNs()).toBe(500_000_000n);
    expect(cache.interpolationGapLimitNs()).toBe(2_000_000_000n);
  });

  it("compresses timeline coverage and prunes index ranges without scanning recording duration", () => {
    const index = createTimelineIndex(
      { endNs: 1_000_000_000_000n, startNs: 0n },
      1,
    );
    const cache = new EpisodeStreamCache();
    for (const second of [10, 11, 12, 900, 901]) {
      cache.set(BigInt(second) * 1_000_000_000n, null);
    }

    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 12, startIndex: 10 },
      { endIndex: 901, startIndex: 900 },
    ]);

    const tickAt = vi.spyOn(index, "tickAt");
    expect(
      cache.pruneTickIndexRanges([{ endIndex: 900, startIndex: 11 }], index),
    ).toBe(3);
    expect(tickAt).toHaveBeenCalledTimes(3);
    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 10, startIndex: 10 },
      { endIndex: 901, startIndex: 901 },
    ]);
  });

  it("ignores placements outside the configured timeline grid", () => {
    const index = createTimelineIndex(
      { endNs: 2_000_000_000n, startNs: 0n },
      1,
    );
    const cache = new EpisodeStreamCache();
    cache.configureTimeline(index);

    cache.set(500_000_000n, MESSAGE);

    expect(cache.has(500_000_000n)).toBe(false);
    expect(cache.stats().accountedBytes).toBe(0);
    expect(cache.cachedTickIndexRanges(index)).toEqual([]);
    expect(cache.revision).toBe(0);
  });

  it("reports each fully released message once when pruning placements", () => {
    const index = createTimelineIndex(
      { endNs: 2_000_000_000n, startNs: 0n },
      1,
    );
    const cache = new EpisodeStreamCache();
    const unique = { ...MESSAGE };
    const repeated = { ...MESSAGE };
    cache.set(0n, unique);
    cache.set(1_000_000_000n, repeated);
    cache.set(2_000_000_000n, repeated);

    const result = cache.pruneTickIndexRangesWithStats(
      [{ endIndex: 2, startIndex: 0 }],
      index,
    );

    expect(result.removedEntries).toBe(3);
    expect(result.releasedMessages).toHaveLength(2);
    expect(
      new Set(result.releasedMessages.map(({ message }) => message)),
    ).toEqual(new Set([unique, repeated]));
    expect(
      result.releasedMessages.map(({ decodedBytes }) => decodedBytes),
    ).toEqual([128, 128]);
    expect(cache.stats().accountedBytes).toBe(0);
  });

  it("keeps compressed coverage synchronized through LRU overflow and resize", () => {
    const index = createTimelineIndex(
      { endNs: 5_000_000_000n, startNs: 0n },
      1,
    );
    const cache = new EpisodeStreamCache(3);
    for (const second of [0, 1, 2]) {
      cache.set(BigInt(second) * 1_000_000_000n, null);
    }
    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 2, startIndex: 0 },
    ]);

    cache.set(3_000_000_000n, null);
    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 3, startIndex: 1 },
    ]);

    cache.resize(2);
    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 3, startIndex: 2 },
    ]);
  });

  it("bounds metadata-only placements and canonicalizes repeated payloads", () => {
    const shared = { ...MESSAGE, recordId: "shared" };
    const cache = new EpisodeStreamCache(3);
    cache.set(0n, null);
    cache.set(1n, shared);
    expect(cache.set(2n, { ...shared })).toMatchObject({
      canonicalEligible: true,
      canonicalized: true,
    });
    cache.set(3n, null);

    expect(cache.has(0n)).toBe(false);
    expect(cache.stats().entryCount).toBe(3);
    expect(cache.stats().decodedBytes).toBe(128);
    expect(cache.stats().placementBytes).toBeGreaterThan(0);
  });

  it("ignores invalid byte hints without hiding measured backing stores", () => {
    const cache = new EpisodeStreamCache();
    const bytes = new Uint8Array(256);
    cache.set(0n, {
      ...MESSAGE,
      output: {
        resourceHints: { sizeBytes: Number.NaN },
        visualization: { bytes, kind: "encoded-image" },
      } as DecodedFrame["output"],
    });

    expect(cache.stats().decodedBytes).toBe(256);

    const oversized = new EpisodeStreamCache();
    oversized.set(0n, {
      ...MESSAGE,
      output: {
        attributes: { label: "still-accounted" },
        resourceHints: { sizeBytes: Number.MAX_SAFE_INTEGER },
      },
    });
    expect(oversized.stats().decodedBytes).toBe(Number.MAX_SAFE_INTEGER);
  });
});
