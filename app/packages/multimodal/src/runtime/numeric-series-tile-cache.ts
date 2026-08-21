import type { NsRange } from "../ir";

/** One immutable, fully addressable numeric-series tile. */
export interface NumericSeriesTile {
  /** Resolution represented by one aggregate bucket. Smaller is finer. */
  readonly bucketDurationNs: bigint;
  /** Successfully acquired source ranges, including known-empty ranges. */
  readonly coverageRanges: readonly NsRange[];
  /** Entire time range addressed by this tile. */
  readonly range: NsRange;
  readonly seriesKey: string;
  /** Recording-relative seconds, sorted ascending. */
  readonly timesSec: Float64Array;
  /** Source ranges that could not be acquired. */
  readonly unavailableRanges: readonly NsRange[];
  readonly values: Float64Array;
}

/** Visible demand retained even when it is least-recently used. */
export interface NumericSeriesTileDemand {
  readonly bucketDurationNs: bigint;
  readonly range: NsRange;
  readonly seriesKey: string;
}

/** One independently clipped array part returned by visible assembly. */
export interface NumericSeriesTilePart {
  readonly bucketDurationNs: bigint;
  /** Packed one-bit markers for retained NaN gap representatives. */
  readonly gapMask: Uint8Array;
  readonly range: NsRange;
  readonly tileId: string;
  readonly timesSec: Float64Array;
  readonly values: Float64Array;
}

/** Deterministic work counters for one visible-range assembly. */
export interface NumericSeriesTileAssemblyWork {
  /** Comparisons made while locating visible tiles and point boundaries. */
  readonly binarySearchSteps: number;
  /** Point pairs copied into the returned immutable parts. */
  readonly pointsCopied: number;
  /** Coverage or unavailable ranges inspected on visible candidates. */
  readonly rangesVisited: number;
  /** Resolution levels eligible to satisfy the requested resolution. */
  readonly resolutionLevelsVisited: number;
  /** Candidate tiles selected for data or range evidence. */
  readonly tilesSelected: number;
  /** Entries inspected after binary range lookup. */
  readonly tilesVisited: number;
}

/** Visible data and exact acquisition state assembled from immutable tiles. */
export interface NumericSeriesTileAssembly {
  readonly coverageRanges: readonly NsRange[];
  readonly parts: readonly NumericSeriesTilePart[];
  readonly tileIds: readonly string[];
  readonly unavailableRanges: readonly NsRange[];
  readonly unreadRanges: readonly NsRange[];
  readonly work: NumericSeriesTileAssemblyWork;
}

/** Current retention and cumulative cache-work evidence. */
export interface NumericSeriesTileCacheStats {
  readonly assemblies: number;
  readonly evictedBytes: number;
  readonly evictedTiles: number;
  readonly maxRetainedBytes: number;
  readonly maxRetainedTiles: number;
  readonly pinnedDemands: number;
  readonly retainedBytes: number;
  readonly retainedTiles: number;
}

export interface NumericSeriesTileCacheOptions {
  /** Exact maximum retained typed-array payload bytes. */
  readonly maxBytes: number;
  /** Metadata bound, including tiles whose numeric payload is empty. */
  readonly maxTiles: number;
  /** Origin used by every tile's recording-relative `timesSec`. */
  readonly timeOriginNs: bigint;
}

/** Source-epoch cache used by viewport-driven plot acquisition. */
export interface NumericSeriesTileCache {
  assembleVisible(demand: NumericSeriesTileDemand): NumericSeriesTileAssembly;
  clear(): void;
  delete(tileId: string): boolean;
  getStats(): NumericSeriesTileCacheStats;
  has(tileId: string): boolean;
  /** Adds or atomically replaces the tile with this exact identity. */
  put(tile: NumericSeriesTile): string;
  /** Adds, updates, or removes a caller-owned visible-demand pin. */
  setPinnedDemand(pinId: string, demand: NumericSeriesTileDemand | null): void;
}

interface StoredTile extends NumericSeriesTile {
  readonly byteLength: number;
  readonly gapMask: Uint8Array;
  readonly id: string;
}

interface CacheEntry {
  lastAccess: number;
  readonly tile: StoredTile;
}

interface ResolutionIndex {
  readonly bucketDurationNs: bigint;
  readonly entries: CacheEntry[];
}

interface SeriesIndex {
  readonly resolutions: ResolutionIndex[];
}

interface MutableAssemblyWork {
  binarySearchSteps: number;
  pointsCopied: number;
  rangesVisited: number;
  resolutionLevelsVisited: number;
  tilesSelected: number;
  tilesVisited: number;
}

interface RangeClaim {
  readonly entry: CacheEntry;
  readonly range: NsRange;
}

interface Selection {
  readonly coverageClaims: readonly RangeClaim[];
  readonly coverageRanges: readonly NsRange[];
  readonly selectedEntries: ReadonlySet<CacheEntry>;
  readonly unavailableRanges: readonly NsRange[];
}

/**
 * Creates a source-local immutable numeric tile cache.
 *
 * The byte budget is exact for retained numeric payloads because every input
 * array is copied into a fresh, exact-sized `Float64Array`. JS object metadata
 * has no portable byte size, so `maxTiles` bounds it independently.
 */
export function createNumericSeriesTileCache({
  maxBytes,
  maxTiles,
  timeOriginNs,
}: NumericSeriesTileCacheOptions): NumericSeriesTileCache {
  validateNonNegativeSafeInteger(maxBytes, "numeric tile cache maxBytes");
  validateNonNegativeSafeInteger(maxTiles, "numeric tile cache maxTiles");

  const entriesById = new Map<string, CacheEntry>();
  const indexBySeries = new Map<string, SeriesIndex>();
  const pinnedDemands = new Map<string, NumericSeriesTileDemand>();
  let assemblies = 0;
  let clock = 0;
  let evictedBytes = 0;
  let evictedTiles = 0;
  let retainedBytes = 0;
  let maxRetainedBytes = 0;
  let maxRetainedTiles = 0;

  const removeEntry = (entry: CacheEntry, evicted: boolean): boolean => {
    if (!entriesById.delete(entry.tile.id)) return false;
    retainedBytes -= entry.tile.byteLength;
    const series = indexBySeries.get(entry.tile.seriesKey);
    const resolution = series?.resolutions.find(
      (candidate) => candidate.bucketDurationNs === entry.tile.bucketDurationNs,
    );
    if (resolution) {
      const index = resolution.entries.indexOf(entry);
      if (index >= 0) resolution.entries.splice(index, 1);
      if (resolution.entries.length === 0 && series) {
        series.resolutions.splice(series.resolutions.indexOf(resolution), 1);
      }
      if (series?.resolutions.length === 0) {
        indexBySeries.delete(entry.tile.seriesKey);
      }
    }
    if (evicted) {
      evictedBytes += entry.tile.byteLength;
      evictedTiles += 1;
    }
    return true;
  };

  const select = (
    demand: NumericSeriesTileDemand,
    work?: MutableAssemblyWork,
  ): Selection => {
    validateDemand(demand);
    const candidates = collectVisibleCandidates(
      indexBySeries.get(demand.seriesKey),
      demand,
      work,
    );
    const coverageClaims: RangeClaim[] = [];
    const selectedEntries = new Set<CacheEntry>();
    let coverageRanges: NsRange[] = [];

    // Available evidence wins over unavailable evidence at every eligible
    // resolution. This lets a finer tile satisfy a coarser request even when
    // another acquisition attempt reported that span unavailable.
    for (const entry of candidates) {
      for (const sourceRange of entry.tile.coverageRanges) {
        if (work) work.rangesVisited += 1;
        const clipped = intersectRange(sourceRange, demand.range);
        if (!clipped) continue;
        for (const range of subtractRanges(clipped, coverageRanges)) {
          coverageClaims.push({ entry, range });
          selectedEntries.add(entry);
          coverageRanges = addRange(coverageRanges, range);
        }
      }
    }

    let unavailableRanges: NsRange[] = [];
    let allKnownRanges = coverageRanges;
    for (const entry of candidates) {
      for (const sourceRange of entry.tile.unavailableRanges) {
        if (work) work.rangesVisited += 1;
        const clipped = intersectRange(sourceRange, demand.range);
        if (!clipped) continue;
        for (const range of subtractRanges(clipped, allKnownRanges)) {
          unavailableRanges = addRange(unavailableRanges, range);
          allKnownRanges = addRange(allKnownRanges, range);
          selectedEntries.add(entry);
        }
      }
    }

    if (work) work.tilesSelected = selectedEntries.size;
    return {
      coverageClaims,
      coverageRanges,
      selectedEntries,
      unavailableRanges,
    };
  };

  const pinnedEntryIds = (): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const demand of pinnedDemands.values()) {
      for (const entry of select(demand).selectedEntries) {
        ids.add(entry.tile.id);
      }
    }
    return ids;
  };

  const evictToBudget = () => {
    while (retainedBytes > maxBytes || entriesById.size > maxTiles) {
      const pinned = pinnedEntryIds();
      let oldest: CacheEntry | undefined;
      for (const entry of entriesById.values()) {
        if (pinned.has(entry.tile.id)) continue;
        if (!oldest || entry.lastAccess < oldest.lastAccess) oldest = entry;
      }
      // Visible demand is authoritative. If it alone exceeds a budget, retain
      // it and expose the overage through stats instead of evicting the view.
      if (!oldest) break;
      removeEntry(oldest, true);
    }
  };

  const put = (input: NumericSeriesTile): string => {
    const tile = storeTile(input, timeOriginNs);
    const existing = entriesById.get(tile.id);
    if (existing) removeEntry(existing, false);

    const series = getOrCreateSeriesIndex(indexBySeries, tile.seriesKey);
    const resolution = getOrCreateResolutionIndex(
      series,
      tile.bucketDurationNs,
    );
    const insertionIndex = lowerBoundEntryStart(
      resolution.entries,
      tile.range.startNs,
    );
    assertDoesNotOverlapNeighbor(resolution.entries, insertionIndex, tile);
    const entry: CacheEntry = { lastAccess: ++clock, tile };
    resolution.entries.splice(insertionIndex, 0, entry);
    entriesById.set(tile.id, entry);
    retainedBytes += tile.byteLength;
    evictToBudget();
    maxRetainedBytes = Math.max(maxRetainedBytes, retainedBytes);
    maxRetainedTiles = Math.max(maxRetainedTiles, entriesById.size);
    return tile.id;
  };

  return {
    assembleVisible(demand) {
      const work: MutableAssemblyWork = {
        binarySearchSteps: 0,
        pointsCopied: 0,
        rangesVisited: 0,
        resolutionLevelsVisited: 0,
        tilesSelected: 0,
        tilesVisited: 0,
      };
      const selection = select(demand, work);
      const parts: NumericSeriesTilePart[] = [];
      for (const claim of selection.coverageClaims) {
        const part = copyVisiblePart(
          claim.entry.tile,
          claim.range,
          timeOriginNs,
          work,
        );
        if (part) parts.push(part);
      }
      parts.sort((left, right) => compareRanges(left.range, right.range));
      for (const entry of selection.selectedEntries) {
        entry.lastAccess = ++clock;
      }
      assemblies += 1;
      return {
        coverageRanges: selection.coverageRanges,
        parts,
        tileIds: [...selection.selectedEntries].map((entry) => entry.tile.id),
        unavailableRanges: selection.unavailableRanges,
        unreadRanges: subtractRanges(demand.range, [
          ...selection.coverageRanges,
          ...selection.unavailableRanges,
        ]),
        work: { ...work },
      };
    },
    clear() {
      entriesById.clear();
      indexBySeries.clear();
      pinnedDemands.clear();
      retainedBytes = 0;
    },
    delete(tileId) {
      const entry = entriesById.get(tileId);
      return entry ? removeEntry(entry, false) : false;
    },
    getStats() {
      return {
        assemblies,
        evictedBytes,
        evictedTiles,
        maxRetainedBytes,
        maxRetainedTiles,
        pinnedDemands: pinnedDemands.size,
        retainedBytes,
        retainedTiles: entriesById.size,
      };
    },
    has: (tileId) => entriesById.has(tileId),
    put,
    setPinnedDemand(pinId, demand) {
      if (demand) {
        validateDemand(demand);
        pinnedDemands.set(pinId, cloneDemand(demand));
      } else {
        pinnedDemands.delete(pinId);
      }
      evictToBudget();
    },
  };
}

function storeTile(input: NumericSeriesTile, timeOriginNs: bigint): StoredTile {
  validateDemand(input);
  if (input.timesSec.length !== input.values.length) {
    throw new Error("numeric tile times and values must have equal lengths");
  }
  const coverageRanges = canonicalRanges(input.coverageRanges, input.range);
  const unavailableRanges = canonicalRanges(
    input.unavailableRanges,
    input.range,
  );
  if (rangesOverlap(coverageRanges, unavailableRanges)) {
    throw new Error("numeric tile coverage and unavailable ranges overlap");
  }

  const timesSec = Float64Array.from(input.timesSec);
  const values = Float64Array.from(input.values);
  const gapMask = packGapMask(values);
  let previous = Number.NEGATIVE_INFINITY;
  for (const timeSec of timesSec) {
    if (!Number.isFinite(timeSec) || timeSec < previous) {
      throw new Error("numeric tile times must be finite and sorted");
    }
    const timeNs = timeOriginNs + BigInt(Math.round(timeSec * 1e9));
    if (!rangeContainsAny(coverageRanges, timeNs)) {
      throw new Error("numeric tile points must lie within covered ranges");
    }
    previous = timeSec;
  }
  return {
    bucketDurationNs: input.bucketDurationNs,
    byteLength: timesSec.byteLength + values.byteLength + gapMask.byteLength,
    coverageRanges,
    gapMask,
    id: tileIdFor(input),
    range: { ...input.range },
    seriesKey: input.seriesKey,
    timesSec,
    unavailableRanges,
    values,
  };
}

function collectVisibleCandidates(
  series: SeriesIndex | undefined,
  demand: NumericSeriesTileDemand,
  work?: MutableAssemblyWork,
): CacheEntry[] {
  if (!series) return [];
  const candidates: CacheEntry[] = [];
  const end = upperBoundResolution(
    series.resolutions,
    demand.bucketDurationNs,
    work,
  );
  // Prefer the coarsest sufficient tile. Finer tiles fill only gaps, while a
  // coarser tile is never eligible for a fine-resolution request.
  for (let resolutionIndex = end - 1; resolutionIndex >= 0; resolutionIndex--) {
    const resolution = series.resolutions[resolutionIndex];
    if (work) work.resolutionLevelsVisited += 1;
    let entryIndex = lowerBoundEntryStart(
      resolution.entries,
      demand.range.startNs,
      work,
    );
    if (entryIndex > 0) entryIndex -= 1;
    for (; entryIndex < resolution.entries.length; entryIndex += 1) {
      const entry = resolution.entries[entryIndex];
      if (work) work.tilesVisited += 1;
      if (entry.tile.range.startNs > demand.range.endNs) break;
      if (entry.tile.range.endNs >= demand.range.startNs)
        candidates.push(entry);
    }
  }
  return candidates;
}

function copyVisiblePart(
  tile: StoredTile,
  range: NsRange,
  timeOriginNs: bigint,
  work: MutableAssemblyWork,
): NumericSeriesTilePart | null {
  const startSec = Number(range.startNs - timeOriginNs) / 1e9;
  const endSec = Number(range.endNs - timeOriginNs) / 1e9;
  const start = lowerBoundNumber(tile.timesSec, startSec, work);
  const end = upperBoundNumber(tile.timesSec, endSec, work);
  if (start === end) return null;
  const timesSec = tile.timesSec.slice(start, end);
  const values = tile.values.slice(start, end);
  work.pointsCopied += end - start;
  return {
    bucketDurationNs: tile.bucketDurationNs,
    gapMask: packGapMask(values),
    range: { ...range },
    tileId: tile.id,
    timesSec,
    values,
  };
}

/** Packs retained discontinuity representatives without duplicating values. */
function packGapMask(values: Float64Array): Uint8Array {
  let mask: Uint8Array | undefined;
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isNaN(values[index])) continue;
    mask ??= new Uint8Array(Math.ceil(values.length / 8));
    mask[index >>> 3] |= 1 << (index & 7);
  }
  return mask ?? new Uint8Array(0);
}

function getOrCreateSeriesIndex(
  indexes: Map<string, SeriesIndex>,
  seriesKey: string,
): SeriesIndex {
  let series = indexes.get(seriesKey);
  if (!series) {
    series = { resolutions: [] };
    indexes.set(seriesKey, series);
  }
  return series;
}

function getOrCreateResolutionIndex(
  series: SeriesIndex,
  bucketDurationNs: bigint,
): ResolutionIndex {
  const index = lowerBoundResolution(series.resolutions, bucketDurationNs);
  const existing = series.resolutions[index];
  if (existing?.bucketDurationNs === bucketDurationNs) return existing;
  const resolution = { bucketDurationNs, entries: [] };
  series.resolutions.splice(index, 0, resolution);
  return resolution;
}

function assertDoesNotOverlapNeighbor(
  entries: readonly CacheEntry[],
  insertionIndex: number,
  tile: StoredTile,
): void {
  const previous = entries[insertionIndex - 1]?.tile;
  const next = entries[insertionIndex]?.tile;
  if (
    (previous && previous.range.endNs >= tile.range.startNs) ||
    (next && next.range.startNs <= tile.range.endNs)
  ) {
    throw new Error("numeric tiles at the same resolution must not overlap");
  }
}

function cloneDemand(demand: NumericSeriesTileDemand): NumericSeriesTileDemand {
  return { ...demand, range: { ...demand.range } };
}

function validateDemand(demand: NumericSeriesTileDemand): void {
  if (!demand.seriesKey) throw new Error("numeric tile seriesKey is required");
  if (demand.bucketDurationNs <= 0n) {
    throw new Error("numeric tile bucketDurationNs must be positive");
  }
  if (demand.range.endNs < demand.range.startNs) {
    throw new Error("numeric tile range must be non-empty");
  }
}

function validateNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function tileIdFor(tile: NumericSeriesTileDemand): string {
  return `${tile.seriesKey}\0${tile.bucketDurationNs}:${tile.range.startNs}:${tile.range.endNs}`;
}

function canonicalRanges(
  ranges: readonly NsRange[],
  bounds: NsRange,
): readonly NsRange[] {
  let canonical: NsRange[] = [];
  for (const range of ranges) {
    if (
      range.endNs < range.startNs ||
      range.startNs < bounds.startNs ||
      range.endNs > bounds.endNs
    ) {
      throw new Error("numeric tile state range falls outside its tile");
    }
    canonical = addRange(canonical, range);
  }
  return canonical;
}

function addRange(ranges: readonly NsRange[], next: NsRange): NsRange[] {
  const result: NsRange[] = [];
  let merged = { ...next };
  let inserted = false;
  for (const range of ranges) {
    if (range.endNs + 1n < merged.startNs) {
      result.push(range);
    } else if (merged.endNs + 1n < range.startNs) {
      if (!inserted) {
        result.push(merged);
        inserted = true;
      }
      result.push(range);
    } else {
      merged = {
        endNs: range.endNs > merged.endNs ? range.endNs : merged.endNs,
        startNs:
          range.startNs < merged.startNs ? range.startNs : merged.startNs,
      };
    }
  }
  if (!inserted) result.push(merged);
  return result;
}

function subtractRanges(
  range: NsRange,
  excluded: readonly NsRange[],
): NsRange[] {
  const canonical = excluded.reduce<NsRange[]>(addRange, []);
  const result: NsRange[] = [];
  let cursor = range.startNs;
  for (const blocker of canonical) {
    if (blocker.endNs < cursor) continue;
    if (blocker.startNs > range.endNs) break;
    if (blocker.startNs > cursor) {
      result.push({ endNs: blocker.startNs - 1n, startNs: cursor });
    }
    cursor = blocker.endNs + 1n;
    if (cursor > range.endNs) return result;
  }
  if (cursor <= range.endNs)
    result.push({ endNs: range.endNs, startNs: cursor });
  return result;
}

function intersectRange(left: NsRange, right: NsRange): NsRange | null {
  const startNs = left.startNs > right.startNs ? left.startNs : right.startNs;
  const endNs = left.endNs < right.endNs ? left.endNs : right.endNs;
  return endNs < startNs ? null : { endNs, startNs };
}

function rangesOverlap(
  left: readonly NsRange[],
  right: readonly NsRange[],
): boolean {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftRange = left[leftIndex];
    const rightRange = right[rightIndex];
    if (leftRange.endNs < rightRange.startNs) leftIndex += 1;
    else if (rightRange.endNs < leftRange.startNs) rightIndex += 1;
    else return true;
  }
  return false;
}

function rangeContainsAny(ranges: readonly NsRange[], value: bigint): boolean {
  return ranges.some((range) => value >= range.startNs && value <= range.endNs);
}

function compareRanges(left: NsRange, right: NsRange): number {
  return left.startNs < right.startNs
    ? -1
    : left.startNs > right.startNs
      ? 1
      : left.endNs < right.endNs
        ? -1
        : left.endNs > right.endNs
          ? 1
          : 0;
}

function lowerBoundResolution(
  resolutions: readonly ResolutionIndex[],
  target: bigint,
): number {
  let low = 0;
  let high = resolutions.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (resolutions[middle].bucketDurationNs < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundResolution(
  resolutions: readonly ResolutionIndex[],
  target: bigint,
  work?: MutableAssemblyWork,
): number {
  let low = 0;
  let high = resolutions.length;
  while (low < high) {
    if (work) work.binarySearchSteps += 1;
    const middle = (low + high) >>> 1;
    if (resolutions[middle].bucketDurationNs <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lowerBoundEntryStart(
  entries: readonly CacheEntry[],
  target: bigint,
  work?: MutableAssemblyWork,
): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    if (work) work.binarySearchSteps += 1;
    const middle = (low + high) >>> 1;
    if (entries[middle].tile.range.startNs < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lowerBoundNumber(
  values: Float64Array,
  target: number,
  work: MutableAssemblyWork,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    work.binarySearchSteps += 1;
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundNumber(
  values: Float64Array,
  target: number,
  work: MutableAssemblyWork,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    work.binarySearchSteps += 1;
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
