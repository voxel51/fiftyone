import { describe, expect, it } from "vitest";
import type { NsRange } from "../ir";
import {
  createNumericSeriesTileCache,
  type NumericSeriesTile,
} from "./numeric-series-tile-cache";

const SECOND = 1_000_000_000n;

describe("numeric-series tile cache", () => {
  it("copies immutable inputs and assembles only visible points", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    const input = tile({
      endSec: 9,
      timesSec: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      values: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    });
    const id = cache.put(input);
    input.timesSec[3] = 100;
    input.values[3] = 100;

    const visible = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(3, 5),
      seriesKey: "speed",
    });

    expect(visible.tileIds).toEqual([id]);
    expect(visible.parts).toHaveLength(1);
    expect([...visible.parts[0].timesSec]).toEqual([3, 4, 5]);
    expect([...visible.parts[0].values]).toEqual([13, 14, 15]);
    expect(visible.work.pointsCopied).toBe(3);
    expect(cache.getStats().retainedBytes).toBe(10 * 2 * 8);

    visible.parts[0].values[0] = 999;
    expect(
      cache.assembleVisible({
        bucketDurationNs: SECOND,
        range: secondsRange(3, 3),
        seriesKey: "speed",
      }).parts[0].values[0],
    ).toBe(13);
  });

  it("retains explicit gap bits with mixed finite and NaN values", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    cache.put(
      tile({
        endSec: 2,
        timesSec: [0, 1, 2],
        values: [1, Number.NaN, 3],
      }),
    );

    const [part] = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(0, 2),
      seriesKey: "speed",
    }).parts;

    expect([...part.values]).toEqual([1, Number.NaN, 3]);
    expect([...part.gapMask]).toEqual([0b00000010]);
    expect(cache.getStats().retainedBytes).toBe(3 * 2 * 8 + 1);
  });

  it("uses the coarsest sufficient resolution without using coarse for fine", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    const fineId = cache.put(tile({ bucketDurationNs: SECOND, values: [1] }));
    const coarseId = cache.put(
      tile({ bucketDurationNs: 10n * SECOND, values: [10] }),
    );

    const coarse = cache.assembleVisible({
      bucketDurationNs: 10n * SECOND,
      range: secondsRange(0, 0),
      seriesKey: "speed",
    });
    expect(coarse.tileIds).toEqual([coarseId]);
    expect([...coarse.parts[0].values]).toEqual([10]);

    const refined = cache.assembleVisible({
      bucketDurationNs: 5n * SECOND,
      range: secondsRange(0, 0),
      seriesKey: "speed",
    });
    expect(refined.tileIds).toEqual([fineId]);
    expect([...refined.parts[0].values]).toEqual([1]);

    cache.delete(fineId);
    const unavailableAtFineResolution = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(0, 0),
      seriesKey: "speed",
    });
    expect(unavailableAtFineResolution.tileIds).toEqual([]);
    expect(unavailableAtFineResolution.parts).toEqual([]);
    expect(unavailableAtFineResolution.unreadRanges).toEqual([
      secondsRange(0, 0),
    ]);
  });

  it("keeps covered, unavailable, and unread ranges exact and distinct", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    cache.put(
      tile({
        coverageRanges: [secondsRange(0, 19), secondsRange(40, 59)],
        endSec: 59,
        timesSec: [10, 45],
        unavailableRanges: [secondsRange(20, 29)],
        values: [1, 2],
      }),
    );

    const visible = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(10, 49),
      seriesKey: "speed",
    });

    expect(visible.coverageRanges).toEqual([
      secondsRange(10, 19),
      secondsRange(40, 49),
    ]);
    expect(visible.unavailableRanges).toEqual([secondsRange(20, 29)]);
    expect(visible.unreadRanges).toEqual([secondsRange(30, 39)]);
    expect(visible.parts.map((part) => [...part.values])).toEqual([[1], [2]]);
  });

  it("lets finer coverage satisfy a coarse span reported unavailable", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    cache.put(
      tile({
        bucketDurationNs: 10n * SECOND,
        coverageRanges: [],
        unavailableRanges: [secondsRange(0, 0)],
        values: [],
        timesSec: [],
      }),
    );
    const fineId = cache.put(tile({ values: [7] }));

    const visible = cache.assembleVisible({
      bucketDurationNs: 10n * SECOND,
      range: secondsRange(0, 0),
      seriesKey: "speed",
    });

    expect(visible.tileIds).toEqual([fineId]);
    expect(visible.coverageRanges).toEqual([secondsRange(0, 0)]);
    expect(visible.unavailableRanges).toEqual([]);
    expect([...visible.parts[0].values]).toEqual([7]);
  });

  it("evicts least-recently used payloads with exact byte accounting", () => {
    const cache = createCache({ maxBytes: 32, maxTiles: 10 });
    const first = cache.put(pointTile(0));
    const second = cache.put(pointTile(1));
    expect(cache.getStats().retainedBytes).toBe(32);

    cache.assembleVisible(demandAt(0));
    const third = cache.put(pointTile(2));

    expect(cache.has(first)).toBe(true);
    expect(cache.has(second)).toBe(false);
    expect(cache.has(third)).toBe(true);
    expect(cache.getStats()).toMatchObject({
      evictedBytes: 16,
      evictedTiles: 1,
      retainedBytes: 32,
      retainedTiles: 2,
    });
  });

  it("pins the tiles selected for visible demand above the byte budget", () => {
    const cache = createCache({ maxBytes: 16, maxTiles: 1 });
    const visible = cache.put(pointTile(0));
    cache.setPinnedDemand("plot", demandAt(0));

    const offscreen = cache.put(pointTile(1));
    expect(cache.has(visible)).toBe(true);
    expect(cache.has(offscreen)).toBe(false);

    cache.setPinnedDemand("plot", null);
    const replacement = cache.put(pointTile(1));
    expect(cache.has(visible)).toBe(false);
    expect(cache.has(replacement)).toBe(true);
  });

  it("bounds empty metadata tiles independently from payload bytes", () => {
    const cache = createCache({ maxBytes: 0, maxTiles: 2 });
    const first = cache.put(emptyCoveredTile(0));
    const second = cache.put(emptyCoveredTile(1));
    const third = cache.put(emptyCoveredTile(2));

    expect(cache.has(first)).toBe(false);
    expect(cache.has(second)).toBe(true);
    expect(cache.has(third)).toBe(true);
    expect(cache.getStats()).toMatchObject({
      retainedBytes: 0,
      retainedTiles: 2,
    });
  });

  it("replaces exact identities without retaining historical arrays", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    const firstId = cache.put(pointTile(0, 1));
    const replacementId = cache.put(pointTile(0, 2));

    expect(replacementId).toBe(firstId);
    expect(cache.getStats()).toMatchObject({
      retainedBytes: 16,
      retainedTiles: 1,
    });
    expect([...cache.assembleVisible(demandAt(0)).parts[0].values]).toEqual([
      2,
    ]);
  });

  it("keeps long-session assembly work bounded to the visible tiles", () => {
    const maxTiles = 64;
    const cache = createCache({ maxBytes: maxTiles * 16, maxTiles });
    const pinned = cache.put(pointTile(0));
    cache.setPinnedDemand("old-viewport", demandAt(0));

    for (let second = 1; second < maxTiles; second += 1) {
      cache.put(pointTile(second));
    }
    const shortSessionWork = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(maxTiles - 4, maxTiles - 1),
      seriesKey: "speed",
    }).work;

    for (let second = maxTiles; second < 5_000; second += 1) {
      cache.put(pointTile(second));
    }
    const longSession = cache.assembleVisible({
      bucketDurationNs: SECOND,
      range: secondsRange(4_996, 4_999),
      seriesKey: "speed",
    });
    const oldViewport = cache.assembleVisible(demandAt(0));

    expect(cache.has(pinned)).toBe(true);
    expect(cache.getStats()).toMatchObject({
      maxRetainedTiles: maxTiles,
      retainedTiles: maxTiles,
    });
    expect(longSession.work.tilesVisited).toBeLessThanOrEqual(5);
    expect(oldViewport.work.tilesVisited).toBeLessThanOrEqual(2);
    expect(longSession.work.pointsCopied).toBe(4);
    expect(oldViewport.work.pointsCopied).toBe(1);
    expect(longSession.work.binarySearchSteps).toBeLessThanOrEqual(
      shortSessionWork.binarySearchSteps + 1,
    );
    expect(longSession.parts).toHaveLength(4);
    expect(longSession.parts.map((part) => part.values[0])).toEqual([
      4_996, 4_997, 4_998, 4_999,
    ]);
  });

  it("rejects overlapping tiles at the same resolution", () => {
    const cache = createCache({ maxBytes: 1_000, maxTiles: 10 });
    cache.put(tile({ endSec: 10, timesSec: [0], values: [1] }));

    expect(() =>
      cache.put(
        tile({
          endSec: 20,
          startSec: 10,
          timesSec: [10],
          values: [2],
        }),
      ),
    ).toThrow("must not overlap");
  });
});

function createCache({
  maxBytes,
  maxTiles,
}: {
  readonly maxBytes: number;
  readonly maxTiles: number;
}) {
  return createNumericSeriesTileCache({
    maxBytes,
    maxTiles,
    timeOriginNs: 0n,
  });
}

function tile({
  bucketDurationNs = SECOND,
  coverageRanges,
  endSec = 0,
  seriesKey = "speed",
  startSec = 0,
  timesSec = [startSec],
  unavailableRanges = [],
  values = [startSec],
}: {
  readonly bucketDurationNs?: bigint;
  readonly coverageRanges?: readonly NsRange[];
  readonly endSec?: number;
  readonly seriesKey?: string;
  readonly startSec?: number;
  readonly timesSec?: readonly number[];
  readonly unavailableRanges?: readonly NsRange[];
  readonly values?: readonly number[];
} = {}): NumericSeriesTile {
  const range = secondsRange(startSec, endSec);
  return {
    bucketDurationNs,
    coverageRanges: coverageRanges ?? [range],
    range,
    seriesKey,
    timesSec: Float64Array.from(timesSec),
    unavailableRanges,
    values: Float64Array.from(values),
  };
}

function pointTile(second: number, value = second): NumericSeriesTile {
  return tile({
    endSec: second,
    startSec: second,
    timesSec: [second],
    values: [value],
  });
}

function emptyCoveredTile(second: number): NumericSeriesTile {
  return tile({
    endSec: second,
    startSec: second,
    timesSec: [],
    values: [],
  });
}

function demandAt(second: number) {
  return {
    bucketDurationNs: SECOND,
    range: secondsRange(second, second),
    seriesKey: "speed",
  } as const;
}

function secondsRange(startSec: number, endSec: number): NsRange {
  return {
    endNs: (BigInt(endSec) + 1n) * SECOND - 1n,
    startNs: BigInt(startSec) * SECOND,
  };
}
