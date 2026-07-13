import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../query/bytes";
import type { StreamInventory } from "../../schemas/v1";
import {
  mcapGridPreviewFrameRetainedBytes,
  type McapGridPreviewFrame,
} from "./grid-preview";

/** Keep enough nearby grid samples for first-open and short navigation runs. */
const MAX_SOURCE_ENTRIES = 32;
/** Poster data is bounded independently because point-cloud previews can be large. */
const MAX_POSTER_BYTES = 32 * 1024 * 1024;

/** Immutable source metadata and poster data handed from grid to modal. */
export interface McapSourceBootstrap {
  readonly poster?: McapGridPreviewFrame;
  readonly posterTopic?: string;
  readonly topics?: readonly StreamInventory[];
}

type CacheEntry = McapSourceBootstrap & {
  readonly posterBytes: number;
};

const entries = new Map<string, CacheEntry>();
let retainedPosterBytes = 0;

/**
 * Publishes immutable source facts learned by the grid. The cache deliberately
 * shares no workers or live readers with playback; it only hands off data that
 * can safely be structured-cloned or retained as a bounded render-ready poster.
 */
export function publishMcapSourceBootstrap(
  source: ByteSourceDescriptor,
  bootstrap: McapSourceBootstrap,
): void {
  const key = byteSourceAccessKey(source);
  const current = entries.get(key);
  if (current) {
    retainedPosterBytes -= current.posterBytes;
    entries.delete(key);
  }

  const replacesPoster = bootstrap.poster !== undefined;
  const poster = bootstrap.poster ?? current?.poster;
  const posterTopic =
    bootstrap.posterTopic ??
    (replacesPoster ? undefined : current?.posterTopic);
  const topics = bootstrap.topics ?? current?.topics;
  const next: CacheEntry = {
    ...(poster ? { poster } : {}),
    ...(posterTopic ? { posterTopic } : {}),
    ...(topics ? { topics } : {}),
    posterBytes: mcapGridPreviewFrameRetainedBytes(poster ?? null),
  };
  entries.set(key, next);
  retainedPosterBytes += next.posterBytes;
  evictBootstrapEntries();
}

/** Returns the current source bootstrap without changing its LRU position. */
export function peekMcapSourceBootstrap(
  source: ByteSourceDescriptor,
): McapSourceBootstrap | null {
  return copyEntry(entries.get(byteSourceAccessKey(source)));
}

/** Returns the current source bootstrap and promotes it as recently used. */
export function getMcapSourceBootstrap(
  source: ByteSourceDescriptor,
): McapSourceBootstrap | null {
  const key = byteSourceAccessKey(source);
  const entry = entries.get(key);
  if (!entry) {
    return null;
  }

  entries.delete(key);
  entries.set(key, entry);
  return copyEntry(entry);
}

function copyEntry(entry: CacheEntry | undefined): McapSourceBootstrap | null {
  if (!entry) {
    return null;
  }

  return {
    ...(entry.poster ? { poster: entry.poster } : {}),
    ...(entry.posterTopic ? { posterTopic: entry.posterTopic } : {}),
    ...(entry.topics ? { topics: entry.topics } : {}),
  };
}

/** Clears every source bootstrap between tests. */
export function resetMcapSourceBootstrapCacheForTests(): void {
  entries.clear();
  retainedPosterBytes = 0;
}

function evictBootstrapEntries(): void {
  while (
    entries.size > MAX_SOURCE_ENTRIES ||
    retainedPosterBytes > MAX_POSTER_BYTES
  ) {
    const oldest = entries.entries().next().value as
      | [string, CacheEntry]
      | undefined;
    if (!oldest) {
      return;
    }
    entries.delete(oldest[0]);
    retainedPosterBytes -= oldest[1].posterBytes;
  }
}
