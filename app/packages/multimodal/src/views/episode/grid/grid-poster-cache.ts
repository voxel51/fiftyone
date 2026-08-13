import { LRUCache } from "lru-cache";

import type { ByteSourceDescriptor } from "../../../ir";
import { episodeSourceAccessKey } from "../../../runtime";
import type { PointCloudCameraPose } from "../../../visualization/scene-3d";

const MIB = 1024 * 1024;
const DEFAULT_FALLBACK_BYTES = 64 * MIB;
const MIN_BUDGET_BYTES = 32 * MIB;
const MAX_BUDGET_BYTES = 128 * MIB;
const DEFAULT_MAX_ENTRIES = 2_048;
const ENTRY_METADATA_BYTES = 256;
const CACHE_SCHEMA_VERSION = "grid-poster-v1";
const PREVIEW_SELECTION_POLICY_VERSION = "preview-selection-v1";
const SNAPSHOT_RENDERER_POLICY_VERSION = "point-cloud-snapshot-v1";
export const GRID_POSTER_AUTO_SOURCE = "__AUTO__";

export type GridPosterCacheKey = string;
export type GridPosterSourceKind = "image" | "point-cloud";

export interface GridPosterCacheEntry {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: string;
  readonly pointCloudPoseKey?: string;
  readonly sourceKind: GridPosterSourceKind;
  readonly streamId: string | null;
  readonly streamSourceName: string | null;
  readonly streamSourceNames: readonly string[];
  readonly width: number;
}

export interface GridPosterCacheStats {
  readonly encodesCoalesced: number;
  readonly encodesCompleted: number;
  readonly encodesFailed: number;
  readonly encodesStarted: number;
  readonly entryCount: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
  readonly oversizeRejections: number;
  readonly puts: number;
  readonly replacements: number;
  readonly retainedBytes: number;
  readonly sourceRefreshesHover: number;
  readonly sourceRefreshesPose: number;
  readonly sourceRefreshesSize: number;
  readonly staleHits: number;
  readonly staticHitsAvoidedSessionOpen: number;
}

type MutableStats = {
  -readonly [Key in Exclude<
    keyof GridPosterCacheStats,
    "entryCount" | "retainedBytes"
  >]: GridPosterCacheStats[Key];
};

export interface GridPosterCache {
  clear(): void;
  get(key: GridPosterCacheKey): GridPosterCacheEntry | null;
  peek(key: GridPosterCacheKey): GridPosterCacheEntry | null;
  put(key: GridPosterCacheKey, entry: GridPosterCacheEntry): boolean;
  stats(): GridPosterCacheStats;
}

export interface GridPosterCacheOptions {
  readonly maxEntries?: number;
  readonly maxSizeBytes: number;
}

export interface GridPosterKeyParts {
  readonly datasetId: string;
  readonly mediaField: string | null | undefined;
  readonly posterSourceName?: string | null | undefined;
  readonly posterStartTimeNs?: bigint | null | undefined;
  readonly selectedSourceName: string | null | undefined;
  readonly source: ByteSourceDescriptor;
}

export type GridPosterFreshness = "fresh" | "stale-pose" | "stale-size";

export function createGridPosterCache(
  options: GridPosterCacheOptions,
): GridPosterCache {
  const maxSizeBytes = normalizePositiveInteger(options.maxSizeBytes, 1);
  const maxEntries = normalizePositiveInteger(
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    1,
  );
  const counters: MutableStats = emptyCounters();
  const cache = new LRUCache<GridPosterCacheKey, GridPosterCacheEntry>({
    dispose: (_value, _key, reason) => {
      if (reason === "evict") counters.evictions += 1;
    },
    max: maxEntries,
    maxSize: maxSizeBytes,
    sizeCalculation: entrySizeBytes,
  });

  const publicCache: GridPosterCache & {
    __increment(name: keyof MutableStats): void;
  } = {
    clear() {
      cache.clear();
    },
    get(key) {
      const entry = cache.get(key) ?? null;
      if (entry) counters.hits += 1;
      else counters.misses += 1;
      return entry;
    },
    peek(key) {
      return cache.peek(key) ?? null;
    },
    put(key, entry) {
      const immutableEntry = copyEntry(entry);
      if (entrySizeBytes(immutableEntry) > maxSizeBytes) {
        counters.oversizeRejections += 1;
        return false;
      }
      const replacing = cache.has(key);
      cache.set(key, immutableEntry);
      counters.puts += 1;
      if (replacing) counters.replacements += 1;
      return true;
    },
    stats() {
      return {
        ...counters,
        entryCount: cache.size,
        retainedBytes: cache.calculatedSize,
      };
    },
    __increment(name) {
      counters[name] += 1;
    },
  };
  return publicCache;
}

export function gridPosterCacheKey({
  datasetId,
  mediaField,
  posterSourceName,
  posterStartTimeNs,
  selectedSourceName,
  source,
}: GridPosterKeyParts): GridPosterCacheKey {
  return serializeGridPosterKey([
    CACHE_SCHEMA_VERSION,
    datasetId,
    mediaField ?? null,
    episodeSourceAccessKey(source),
    selectedSourceName ?? GRID_POSTER_AUTO_SOURCE,
    posterSourceName ?? null,
    posterStartTimeNs?.toString() ?? null,
    PREVIEW_SELECTION_POLICY_VERSION,
  ]);
}

export function pointCloudPoseKey(pose: PointCloudCameraPose | null): string {
  return serializeGridPosterKey([
    SNAPSHOT_RENDERER_POLICY_VERSION,
    pose ? JSON.stringify([pose.position, pose.target]) : "AUTO_FIT",
  ]);
}

export function gridPosterFreshness(
  entry: GridPosterCacheEntry,
  size: { readonly height: number; readonly width: number },
  poseKey: string,
): GridPosterFreshness {
  if (
    entry.sourceKind === "point-cloud" &&
    entry.pointCloudPoseKey !== poseKey
  ) {
    return "stale-pose";
  }
  if (entry.width < size.width || entry.height < size.height) {
    return "stale-size";
  }
  return "fresh";
}

export function shouldReplaceGridPoster(
  current: GridPosterCacheEntry | null,
  next: Omit<GridPosterCacheEntry, "bytes">,
): boolean {
  if (!current) return true;
  if (
    next.sourceKind === "point-cloud" &&
    current.pointCloudPoseKey !== next.pointCloudPoseKey
  ) {
    return true;
  }
  return (
    next.width >= current.width &&
    next.height >= current.height &&
    (next.width > current.width || next.height > current.height)
  );
}

export function defaultGridPosterCacheBudgetBytes(): number {
  if (typeof navigator === "undefined") return DEFAULT_FALLBACK_BYTES;
  const memory = (navigator as Navigator & { readonly deviceMemory?: number })
    .deviceMemory;
  if (!Number.isFinite(memory) || !memory || memory <= 0) {
    return DEFAULT_FALLBACK_BYTES;
  }
  return Math.round(
    Math.min(
      MAX_BUDGET_BYTES,
      Math.max(MIN_BUDGET_BYTES, (memory / 8) * MAX_BUDGET_BYTES),
    ),
  );
}

let singleton = createGridPosterCache({
  maxEntries: DEFAULT_MAX_ENTRIES,
  maxSizeBytes: defaultGridPosterCacheBudgetBytes(),
});

export function getGridPosterCache(): GridPosterCache {
  return singleton;
}

export function clearGridPosterCache(): void {
  singleton.clear();
}

export function resetGridPosterCacheForTests(options?: GridPosterCacheOptions) {
  singleton = createGridPosterCache(
    options ?? {
      maxEntries: DEFAULT_MAX_ENTRIES,
      maxSizeBytes: defaultGridPosterCacheBudgetBytes(),
    },
  );
}

export function recordGridPosterDiagnostic(
  name: keyof Pick<
    MutableStats,
    | "encodesCoalesced"
    | "encodesCompleted"
    | "encodesFailed"
    | "encodesStarted"
    | "sourceRefreshesHover"
    | "sourceRefreshesPose"
    | "sourceRefreshesSize"
    | "staleHits"
    | "staticHitsAvoidedSessionOpen"
  >,
): void {
  // The production singleton owns page-session diagnostics alongside entries.
  const cache = singleton as GridPosterCache & {
    __increment?: (name: keyof MutableStats) => void;
  };
  cache.__increment?.(name);
}

function emptyCounters(): MutableStats {
  return {
    encodesCoalesced: 0,
    encodesCompleted: 0,
    encodesFailed: 0,
    encodesStarted: 0,
    evictions: 0,
    hits: 0,
    misses: 0,
    oversizeRejections: 0,
    puts: 0,
    replacements: 0,
    sourceRefreshesHover: 0,
    sourceRefreshesPose: 0,
    sourceRefreshesSize: 0,
    staleHits: 0,
    staticHitsAvoidedSessionOpen: 0,
  };
}

function copyEntry(entry: GridPosterCacheEntry): GridPosterCacheEntry {
  return Object.freeze({
    ...entry,
    bytes: entry.bytes.slice(),
    streamSourceNames: Object.freeze([...entry.streamSourceNames]),
  });
}

function entrySizeBytes(entry: GridPosterCacheEntry): number {
  return entry.bytes.byteLength + ENTRY_METADATA_BYTES;
}

function normalizePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function serializeGridPosterKey(parts: readonly (string | null)[]): string {
  return JSON.stringify(parts);
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.defineProperty(
    window as Window & {
      __FIFTYONE_GRID_POSTER_CACHE__?: {
        clear(): void;
        stats(): GridPosterCacheStats;
      };
    },
    "__FIFTYONE_GRID_POSTER_CACHE__",
    {
      configurable: true,
      value: {
        clear: clearGridPosterCache,
        stats: () => getGridPosterCache().stats(),
      },
    },
  );
}
