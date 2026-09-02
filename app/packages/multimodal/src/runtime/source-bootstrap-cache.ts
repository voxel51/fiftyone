import type {
  ByteSourceDescriptor,
  EpisodeManifest,
  EpisodePosterFrame,
  EpisodePreviewReadResult,
  EpisodeTimeline,
  TimeWindow,
} from "../ir";
import { byteSourceAccessKey } from "../query/bytes";
import {
  normalizeSourceFactsPayload,
  SOURCE_FACTS_MCAP_ADAPTER_ID,
  type SourceFactsPayload,
  type SourceFactsTrust,
} from "./source-facts";

/**
 * Keep a full grid viewport plus virtualization overscan for first-open and
 * short navigation runs. Poster bytes retain their independent hard ceiling.
 */
const MAX_SOURCE_ENTRIES = 64;
/** Poster data is bounded independently because point-cloud previews can be large. */
const MAX_POSTER_BYTES = 32 * 1024 * 1024;

/** Immutable source facts handed from a lightweight grid to an episode modal. */
export interface SourceBootstrap {
  readonly manifest?: EpisodeManifest;
  readonly poster?: EpisodePosterFrame;
  readonly posterStreamId?: string;
  /** A lightweight preview read completed, even if it found no poster. */
  readonly previewReadComplete?: boolean;
  readonly timeline?: EpisodeTimeline;
  readonly timeRange?: TimeWindow;
}

/** Trusted adapter inputs projected separately from the bootstrap UI. */
export interface SourceSessionHints {
  readonly manifestHint?: EpisodeManifest;
  readonly playbackHint?: EpisodeTimeline;
}

interface DurableFactLane {
  readonly adapterId: string;
  readonly facts: SourceFactsPayload;
  /** Opaque identity of the disk entry that produced this lane. */
  readonly revision?: object;
  readonly trust: Exclude<SourceFactsTrust, "current">;
}

interface CacheEntry {
  readonly currentFacts?: SourceFactsPayload;
  readonly durableFacts?: DurableFactLane;
  readonly poster?: EpisodePosterFrame;
  readonly posterBytes: number;
  readonly posterStreamId?: string;
  readonly previewReadComplete?: boolean;
}

const entries = new Map<string, CacheEntry>();
const snapshots = new WeakMap<CacheEntry, SourceBootstrap>();
let retainedPosterBytes = 0;
const listenersBySource = new Map<string, Set<() => void>>();

function notifySourceListeners(key: string): void {
  for (const listener of listenersBySource.get(key) ?? []) listener();
}

/** Publishes cloneable current-page source facts or poster state. */
export function publishSourceBootstrap(
  source: ByteSourceDescriptor,
  bootstrap: SourceBootstrap,
): void {
  const key = sourceBootstrapKey(source);
  const current = removeEntry(key);
  const replacesPoster = bootstrap.poster !== undefined;
  const poster = bootstrap.poster ?? current?.poster;
  const posterStreamId =
    bootstrap.posterStreamId ??
    (replacesPoster ? undefined : current?.posterStreamId);
  const hasFacts =
    bootstrap.manifest !== undefined ||
    bootstrap.timeline !== undefined ||
    bootstrap.timeRange !== undefined;
  const currentFacts = hasFacts
    ? (normalizeSourceFactsPayload({
        ...current?.currentFacts,
        ...(bootstrap.manifest ? { manifest: bootstrap.manifest } : {}),
        ...(bootstrap.timeline ? { timeline: bootstrap.timeline } : {}),
        ...(bootstrap.timeRange ? { timeRange: bootstrap.timeRange } : {}),
      }) ?? undefined)
    : current?.currentFacts;
  const next: CacheEntry = {
    ...(currentFacts ? { currentFacts } : {}),
    // Any live fact publication is authoritative for this access path. Drop
    // the durable lane rather than field-merging provisional data into trust.
    ...(!hasFacts && current?.durableFacts
      ? { durableFacts: current.durableFacts }
      : {}),
    ...(poster ? { poster } : {}),
    ...(posterStreamId ? { posterStreamId } : {}),
    ...((bootstrap.previewReadComplete ?? current?.previewReadComplete)
      ? { previewReadComplete: true }
      : {}),
    posterBytes: retainedBinaryBytes(poster ?? null),
  };
  storeEntry(key, next);
}

/** Replaces all durable facts with one authoritative current-page payload. */
export function publishCurrentSourceFacts(
  source: ByteSourceDescriptor,
  facts: SourceFactsPayload,
): void {
  const normalized = normalizeSourceFactsPayload(facts);
  if (!normalized) return;
  const key = sourceBootstrapKey(source);
  const current = removeEntry(key);
  storeEntry(key, {
    ...(current ?? { posterBytes: 0 }),
    currentFacts: normalized,
    durableFacts: undefined,
  });
}

/** Publishes one wholesale durable lane without affecting grid range state. */
export function publishDurableSourceFacts(
  source: ByteSourceDescriptor,
  lane: DurableFactLane,
): void {
  const normalized = normalizeSourceFactsPayload(lane.facts);
  if (!normalized) return;
  const key = sourceBootstrapKey(source);
  const current = removeEntry(key);
  storeEntry(key, {
    ...(current ?? { posterBytes: 0 }),
    durableFacts: { ...lane, facts: normalized },
  });
}

/** Removes durable UI facts only when they still belong to one disk read. */
export function retractDurableSourceFacts(
  source: ByteSourceDescriptor,
  revision: object,
): void {
  const key = sourceBootstrapKey(source);
  const entry = entries.get(key);
  if (!entry || entry.durableFacts?.revision !== revision) return;
  removeEntry(key);
  const { durableFacts: _durableFacts, ...retained } = entry;
  if (
    retained.currentFacts ||
    retained.poster ||
    retained.posterStreamId ||
    retained.previewReadComplete
  ) {
    storeEntry(key, retained);
  } else {
    notifySourceListeners(key);
  }
}

/**
 * Publishes every reusable fact learned by one lightweight preview read, and
 * returns the episode time range the read established, if any.
 *
 * The range is returned rather than published to the episode registry here:
 * this cache is keyed by byte source, and `sourceId` is only sometimes an
 * episode identity — `byteSourceFromSample` mints it from `sample._id`, while
 * a media-reference source mints it from the reference key. Publishing under
 * it therefore filed the range where no consumer looks whenever the sample
 * carried a media reference. Only the caller knows the episode.
 */
export function publishEpisodePreviewBootstrap(
  source: ByteSourceDescriptor,
  result: EpisodePreviewReadResult,
): TimeWindow | null {
  const timeRange = result.bootstrapTimeline
    ? {
        endNs: result.bootstrapTimeline.endNs,
        startNs: result.bootstrapTimeline.startNs,
      }
    : result.bootstrapTimeRange;
  publishSourceBootstrap(source, {
    ...(result.bootstrapManifest ? { manifest: result.bootstrapManifest } : {}),
    ...(result.bootstrapTimeline ? { timeline: result.bootstrapTimeline } : {}),
    ...(timeRange ? { timeRange } : {}),
    ...(result.frame
      ? {
          poster: result.frame,
          ...(result.streamId ? { posterStreamId: result.streamId } : {}),
        }
      : {}),
    previewReadComplete: true,
  });
  return timeRange ?? null;
}

/** Returns the UI bootstrap projection without changing its LRU position. */
export function peekSourceBootstrap(
  source: ByteSourceDescriptor,
): SourceBootstrap | null {
  return copyEntry(entries.get(sourceBootstrapKey(source)));
}

/** Returns the UI bootstrap projection and promotes it as recently used. */
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

/** Returns only current or content-validated facts eligible for adapter use. */
export function getSourceSessionHints(
  source: ByteSourceDescriptor,
  adapterId: string,
): SourceSessionHints | null {
  const entry = entries.get(sourceBootstrapKey(source));
  if (!entry) return null;
  const durable =
    entry.durableFacts?.trust === "validated" &&
    entry.durableFacts.adapterId === adapterId
      ? entry.durableFacts.facts
      : undefined;
  const manifest = entry.currentFacts?.manifest ?? durable?.manifest;
  const timeline = entry.currentFacts?.timeline ?? durable?.timeline;
  const playbackHint = validPlaybackHint(adapterId, manifest, timeline)
    ? timeline
    : undefined;
  if (!manifest && !playbackHint) return null;
  return {
    ...(manifest ? { manifestHint: manifest } : {}),
    ...(playbackHint ? { playbackHint } : {}),
  };
}

/** Stable cache snapshot reader suitable for `useSyncExternalStore`. */
export const getSourceBootstrapSnapshot = peekSourceBootstrap;

/** Subscribes to one source's bootstrap publishes. */
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
    if (listeners.size === 0) listenersBySource.delete(key);
  };
}

/** Cache identity for current-page source facts, including access validators. */
export function sourceBootstrapKey(source: ByteSourceDescriptor): string {
  return JSON.stringify([byteSourceAccessKey(source), source.etag ?? null]);
}

/** Clears every source bootstrap between tests. */
export function resetSourceBootstrapCacheForTests(): void {
  entries.clear();
  retainedPosterBytes = 0;
  for (const key of listenersBySource.keys()) notifySourceListeners(key);
}

/** Counts unique retained binary allocations in an arbitrary poster graph. */
export function retainedBinaryBytes(value: unknown): number {
  const buffers = new Set<ArrayBufferLike>();
  collectArrayBuffers(value, buffers, new Set<object>());
  let total = 0;
  for (const buffer of buffers) total += buffer.byteLength;
  return total;
}

function removeEntry(key: string): CacheEntry | undefined {
  const current = entries.get(key);
  if (!current) return undefined;
  entries.delete(key);
  retainedPosterBytes -= current.posterBytes;
  return current;
}

function storeEntry(key: string, entry: CacheEntry): void {
  entries.set(key, entry);
  retainedPosterBytes += entry.posterBytes;
  const evicted = evictBootstrapEntries();
  notifySourceListeners(key);
  for (const evictedKey of evicted) {
    if (evictedKey !== key) notifySourceListeners(evictedKey);
  }
}

function copyEntry(entry: CacheEntry | undefined): SourceBootstrap | null {
  if (!entry) return null;
  const retained = snapshots.get(entry);
  if (retained) return retained;
  const facts = uiFacts(entry);
  const snapshot = {
    ...(facts?.manifest ? { manifest: facts.manifest } : {}),
    ...(entry.poster ? { poster: entry.poster } : {}),
    ...(entry.posterStreamId ? { posterStreamId: entry.posterStreamId } : {}),
    ...(entry.previewReadComplete ? { previewReadComplete: true } : {}),
    ...(facts?.timeRange ? { timeRange: facts.timeRange } : {}),
    ...(facts?.timeline ? { timeline: facts.timeline } : {}),
  };
  snapshots.set(entry, snapshot);
  return snapshot;
}

function uiFacts(entry: CacheEntry): SourceFactsPayload | null {
  const current = entry.currentFacts;
  const durable = entry.durableFacts?.facts;
  if (!current && !durable) return null;
  const manifest = current?.manifest ?? durable?.manifest;
  const timeline = current?.timeline ?? durable?.timeline;
  const timeRange = current?.timeRange ?? durable?.timeRange;
  return {
    ...(manifest ? { manifest } : {}),
    ...(timeline ? { timeline } : {}),
    ...(timeRange ? { timeRange } : {}),
  };
}

function validPlaybackHint(
  adapterId: string,
  manifest: EpisodeManifest | undefined,
  timeline: EpisodeTimeline | undefined,
): timeline is EpisodeTimeline {
  if (!timeline) return false;
  if (manifest && manifest.timeDomain.id !== timeline.timeDomainId)
    return false;
  return (
    adapterId !== SOURCE_FACTS_MCAP_ADAPTER_ID ||
    timeline.timeDomainId === "log"
  );
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
