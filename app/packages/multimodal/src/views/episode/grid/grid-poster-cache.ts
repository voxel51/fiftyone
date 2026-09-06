import { LRUCache } from "lru-cache";

import type { MultimodalGridFit } from "@fiftyone/state";
import type { GridPosterProviderMetadata } from "../../../extensions/grid-posters";
import type { ByteSourceDescriptor } from "../../../ir";
import type { PointCloudCameraPose } from "../../../visualization/scene-3d";

const MIB = 1024 * 1024;
const DEFAULT_FALLBACK_BYTES = 64 * MIB;
const MIN_BUDGET_BYTES = 32 * MIB;
const MAX_BUDGET_BYTES = 128 * MIB;
const DEFAULT_MAX_ENTRIES = 2_048;
const ENTRY_METADATA_BYTES = 256;
const CACHE_SCHEMA_VERSION = "grid-poster-v3";
const PREVIEW_SELECTION_POLICY_VERSION = "preview-selection-v1";
const PREVIEW_STATE_KEY_VERSION = "grid-preview-state-v1";
const SNAPSHOT_RENDERER_POLICY_VERSION = "point-cloud-snapshot-v1";
export const GRID_POSTER_AUTO_SOURCE = "__AUTO__";

export type GridPosterCacheKey = string;
export type GridPosterSourceKind = "image" | "point-cloud";

export interface GridPosterCacheEntry {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: string;
  readonly pointCloudPoseKey?: string;
  readonly provider?: GridPosterProviderMetadata;
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
  readonly providerArtifactFailures: number;
  readonly providerArtifactHits: number;
  readonly providerDescriptorHits: number;
  readonly providerDescriptorMisses: number;
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
  /** Promotes an entry without changing hit/miss diagnostics. */
  touch(key: GridPosterCacheKey): GridPosterCacheEntry | null;
}

interface GridPosterCacheInternals {
  __increment(name: keyof MutableStats): void;
}

export interface GridPosterCacheOptions {
  readonly maxEntries?: number;
  readonly maxSizeBytes: number;
}

export interface GridPosterKeyParts {
  readonly datasetId: string;
  readonly imageFit: MultimodalGridFit;
  readonly mediaField: string | null | undefined;
  readonly mediaPath?: string | null | undefined;
  readonly posterSourceName?: string | null | undefined;
  readonly posterStartTimeNs?: bigint | null | undefined;
  readonly providerRevision?: string | null | undefined;
  readonly selectedSourceName: string | null | undefined;
  readonly source: ByteSourceDescriptor;
}

export type GridPosterFreshness = "fresh" | "stale-pose" | "stale-size";

export function createGridPosterCache(
  options: GridPosterCacheOptions,
): GridPosterCache & GridPosterCacheInternals {
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

  const publicCache: GridPosterCache & GridPosterCacheInternals = {
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
      if (entrySizeBytes(entry) > maxSizeBytes) {
        counters.oversizeRejections += 1;
        return false;
      }
      const immutableEntry = copyEntry(entry);
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
    touch(key) {
      return cache.get(key) ?? null;
    },
    __increment(name) {
      counters[name] += 1;
    },
  };
  return publicCache;
}

function gridPreviewIdentityParts({
  datasetId,
  mediaField,
  mediaPath,
  posterSourceName,
  posterStartTimeNs,
  providerRevision,
  selectedSourceName,
  source,
}: Omit<GridPosterKeyParts, "imageFit">): readonly (string | null)[] {
  return [
    CACHE_SCHEMA_VERSION,
    datasetId,
    mediaField ?? null,
    source.sourceId,
    stableMediaFilename(mediaPath ?? source.url),
    source.sizeBytes ?? null,
    source.etag ?? null,
    providerRevision ?? null,
    selectedSourceName ?? GRID_POSTER_AUTO_SOURCE,
    posterSourceName ?? null,
    posterStartTimeNs?.toString() ?? null,
    PREVIEW_SELECTION_POLICY_VERSION,
  ];
}

/** Stable owner identity for live preview state, independent of presentation fit. */
export function gridPreviewStateKey(
  parts: Omit<GridPosterKeyParts, "imageFit">,
): string {
  return serializeGridPosterKey([
    ...gridPreviewIdentityParts(parts),
    PREVIEW_STATE_KEY_VERSION,
  ]);
}

/** Persistent identity for a poster whose canvas bytes bake in presentation fit. */
export function gridPosterCacheKey(
  parts: GridPosterKeyParts,
): GridPosterCacheKey {
  const { imageFit, ...identity } = parts;
  return serializeGridPosterKey([
    ...gridPreviewIdentityParts(identity),
    imageFit,
  ]);
}

/**
 * Extracts a reload-stable file identity without retaining signed URL query
 * parameters. Dataset, media field, and source/sample ID remain the primary
 * namespace; the filename guards a sample whose backing media path changes.
 */
function stableMediaFilename(pathOrUrl: string): string {
  const filepath = encodedQueryValue(pathOrUrl, "filepath");
  const path = (filepath ?? pathOrUrl)
    .split(/[?#]/, 1)[0]
    .replaceAll("\\", "/");
  const encodedName = path.slice(path.lastIndexOf("/") + 1);
  if (!encodedName) return "";
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
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
  if (entry.provider) {
    if (
      entry.sourceKind === "point-cloud" &&
      poseKey !== pointCloudPoseKey(null)
    ) {
      return "stale-pose";
    }
    // Provider posters are the bounded cold-grid tier. Upsizing one would
    // open a live preview session and defeat that optimization.
    return "fresh";
  }
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
  if (!current.provider && next.provider) return false;
  if (current.provider && !next.provider) return true;
  if (current.sourceKind !== next.sourceKind) return true;
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

let singleton: GridPosterCache & GridPosterCacheInternals =
  createGridPosterCache({
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
    | "hits"
    | "misses"
    | "providerArtifactFailures"
    | "providerArtifactHits"
    | "providerDescriptorHits"
    | "providerDescriptorMisses"
    | "sourceRefreshesHover"
    | "sourceRefreshesPose"
    | "sourceRefreshesSize"
    | "staleHits"
    | "staticHitsAvoidedSessionOpen"
  >,
): void {
  // The production singleton owns page-session diagnostics alongside entries.
  singleton.__increment(name);
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
    providerArtifactFailures: 0,
    providerArtifactHits: 0,
    providerDescriptorHits: 0,
    providerDescriptorMisses: 0,
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
    provider: entry.provider ? Object.freeze({ ...entry.provider }) : undefined,
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

function encodedQueryValue(value: string, name: string): string | null {
  const queryStart = value.indexOf("?");
  if (queryStart < 0) return null;
  const fragmentStart = value.indexOf("#", queryStart);
  const query = value.slice(
    queryStart + 1,
    fragmentStart < 0 ? undefined : fragmentStart,
  );
  return new URLSearchParams(query).get(name);
}
