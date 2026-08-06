import { describe, expect, it, vi } from "vitest";
import type { DecodedFrame } from "../ir";
import { EpisodeStreamCache } from "./episode-stream-cache";

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
    expect(cache.cachedTicks()).toHaveLength(2);
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
    expect(cache.cachedTicks()).toHaveLength(2);
  });

  it("counts one decoded message once across multiple tick placements", () => {
    const cache = new EpisodeStreamCache();

    cache.set(1n, MESSAGE);
    cache.set(2n, MESSAGE);
    cache.set(3n, MESSAGE);

    expect(cache.decodedBytes).toBe(128);
    expect(cache.cachedTicks()).toHaveLength(3);

    cache.pruneOutsideRanges([{ endTick: 3n, startTick: 3n }]);
    expect(cache.decodedBytes).toBe(128);

    cache.clear();
    expect(cache.decodedBytes).toBe(0);
    expect(cache.cachedTicks()).toHaveLength(0);
  });

  it("canonicalizes equivalent indexed artifacts while the record is resident", () => {
    const cache = new EpisodeStreamCache();
    const first = { ...MESSAGE, recordId: "record:1" };
    const duplicate = { ...MESSAGE, recordId: "record:1" };

    cache.set(1n, first);
    cache.set(2n, duplicate);

    expect(cache.get(2n)).toBe(first);
    expect(cache.decodedBytes).toBe(128);
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
    cache.set(3n, reloaded);
    expect(cache.get(3n)).toBe(reloaded);
  });

  it("does not canonicalize frames without a collision-safe record id", () => {
    const cache = new EpisodeStreamCache();
    const duplicate = { ...MESSAGE };

    cache.set(1n, MESSAGE);
    cache.set(2n, duplicate);
    expect(cache.get(2n)).toBe(duplicate);
    expect(cache.decodedBytes).toBe(256);
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
    expect(cache.decodedBytes).toBe(128);

    cache.set(2n, second);
    expect(cache.decodedBytes).toBe(256);
    expect(cache.cachedTicks()).toHaveLength(1);

    cache.set(2n, MESSAGE);
    expect(cache.decodedBytes).toBe(128);

    cache.clear();
    expect(cache.decodedBytes).toBe(0);
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
    expect(cache.decodedBytes).toBe(128);
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
});
