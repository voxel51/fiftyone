import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodePosterFrame,
  EpisodeTimeline,
  TimeWindow,
} from "../ir";
import { byteSourceAccessKey } from "../query/bytes";

/** Keep enough nearby grid samples for first-open and short navigation runs. */
const MAX_SOURCE_ENTRIES = 32;
/** Poster data is bounded independently because point-cloud previews can be large. */
const MAX_POSTER_BYTES = 32 * 1024 * 1024;

/** Immutable source facts handed from a lightweight grid to an episode modal. */
export interface SourceBootstrap {
  readonly manifest?: EpisodeManifest;
  readonly poster?: EpisodePosterFrame;
  readonly posterStreamId?: string;
  readonly timeline?: EpisodeTimeline;
  readonly timeRange?: TimeWindow;
}

type CacheEntry = SourceBootstrap & {
  readonly posterBytes: number;
};

const entries = new Map<string, CacheEntry>();
let retainedPosterBytes = 0;
const listenersBySource = new Map<string, Set<() => void>>();

function notifySourceListeners(key: string): void {
  for (const listener of listenersBySource.get(key) ?? []) {
    listener();
  }
}

/** Publishes cloneable source facts learned by a lightweight grid. */
export function publishSourceBootstrap(
  source: ByteSourceDescriptor,
  bootstrap: SourceBootstrap,
): void {
  const key = sourceBootstrapKey(source);
  const current = entries.get(key);
  if (current) {
    retainedPosterBytes -= current.posterBytes;
    entries.delete(key);
  }

  const replacesPoster = bootstrap.poster !== undefined;
  const poster = bootstrap.poster ?? current?.poster;
  const posterStreamId =
    bootstrap.posterStreamId ??
    (replacesPoster ? undefined : current?.posterStreamId);
  const manifest = bootstrap.manifest ?? current?.manifest;
  const timeline = bootstrap.timeline ?? current?.timeline;
  const timeRange = bootstrap.timeRange ?? current?.timeRange;
  const next: CacheEntry = {
    ...(manifest ? { manifest } : {}),
    ...(poster ? { poster } : {}),
    ...(posterStreamId ? { posterStreamId } : {}),
    ...(timeRange ? { timeRange } : {}),
    ...(timeline ? { timeline } : {}),
    posterBytes: retainedBinaryBytes(poster ?? null),
  };
  entries.set(key, next);
  retainedPosterBytes += next.posterBytes;
  const evicted = evictBootstrapEntries();
  notifySourceListeners(key);
  // An eviction is a change too: a subscriber holding the evicted source's
  // snapshot must re-read (and see null), not keep rendering stale facts
  for (const evictedKey of evicted) {
    if (evictedKey !== key) {
      notifySourceListeners(evictedKey);
    }
  }
}

/** Returns the current source bootstrap without changing its LRU position. */
export function peekSourceBootstrap(
  source: ByteSourceDescriptor,
): SourceBootstrap | null {
  return copyEntry(entries.get(sourceBootstrapKey(source)));
}

/** Returns the current source bootstrap and promotes it as recently used. */
export function getSourceBootstrap(
  source: ByteSourceDescriptor,
): SourceBootstrap | null {
  const key = sourceBootstrapKey(source);
  const entry = entries.get(key);
  if (!entry) return null;

  entries.delete(key);
  entries.set(key, entry);
  return copyEntry(entry);
}

/** Returns a stable cache snapshot suitable for `useSyncExternalStore`. */
export function getSourceBootstrapSnapshot(
  source: ByteSourceDescriptor,
): SourceBootstrap | null {
  return entries.get(sourceBootstrapKey(source)) ?? null;
}

/** Subscribes to one source's bootstrap publishes, for
 * `useSyncExternalStore` alongside {@link getSourceBootstrapSnapshot}. */
export function subscribeSourceBootstrap(
  source: ByteSourceDescriptor,
  listener: () => void,
): () => void {
  const key = sourceBootstrapKey(source);
  const listeners = listenersBySource.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  listenersBySource.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersBySource.delete(key);
    }
  };
}

/** Cache identity for source facts, including transport validators. */
export function sourceBootstrapKey(source: ByteSourceDescriptor): string {
  return JSON.stringify([byteSourceAccessKey(source), source.etag ?? null]);
}

function copyEntry(entry: CacheEntry | undefined): SourceBootstrap | null {
  if (!entry) return null;
  return {
    ...(entry.manifest ? { manifest: entry.manifest } : {}),
    ...(entry.poster ? { poster: entry.poster } : {}),
    ...(entry.posterStreamId ? { posterStreamId: entry.posterStreamId } : {}),
    ...(entry.timeRange ? { timeRange: entry.timeRange } : {}),
    ...(entry.timeline ? { timeline: entry.timeline } : {}),
  };
}

/** Clears every source bootstrap between tests. */
export function resetSourceBootstrapCacheForTests(): void {
  entries.clear();
  retainedPosterBytes = 0;
  for (const key of listenersBySource.keys()) {
    notifySourceListeners(key);
  }
}

function evictBootstrapEntries(): string[] {
  const evicted: string[] = [];
  while (
    entries.size > MAX_SOURCE_ENTRIES ||
    retainedPosterBytes > MAX_POSTER_BYTES
  ) {
    const oldest = entries.entries().next().value as
      | [string, CacheEntry]
      | undefined;
    if (!oldest) break;
    entries.delete(oldest[0]);
    retainedPosterBytes -= oldest[1].posterBytes;
    evicted.push(oldest[0]);
  }
  return evicted;
}

/** Counts unique retained binary allocations in an arbitrary poster graph. */
export function retainedBinaryBytes(value: unknown): number {
  const buffers = new Set<ArrayBufferLike>();
  collectArrayBuffers(value, buffers, new Set<object>());
  let total = 0;
  for (const buffer of buffers) total += buffer.byteLength;
  return total;
}

function collectArrayBuffers(
  value: unknown,
  buffers: Set<ArrayBufferLike>,
  visited: Set<object>,
): void {
  if (ArrayBuffer.isView(value)) {
    buffers.add(value.buffer);
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return;

  visited.add(value);
  for (const child of Object.values(value)) {
    collectArrayBuffers(child, buffers, visited);
  }
}
