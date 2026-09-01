import { useSyncExternalStore } from "react";
import type { EpisodeIntervalSource } from "./types";

/**
 * Registry of episode-interval sources. Mirrors the timeline-extension
 * registry: the shared grid tile and modal timeline render whatever is
 * registered and render nothing before registration, so no shared file ever
 * imports edition code.
 */

interface EpisodeIntervalSourceRegistry {
  readonly sources: Map<string, EpisodeIntervalSource>;
  readonly listeners: Set<() => void>;
  snapshot: readonly EpisodeIntervalSource[];
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:episode-interval-source-registry",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const registry = (globalRegistry[REGISTRY_KEY] ??= {
  sources: new Map(),
  listeners: new Set(),
  snapshot: [],
} satisfies EpisodeIntervalSourceRegistry) as EpisodeIntervalSourceRegistry;

function rebuildSnapshot(): void {
  registry.snapshot = sortSources([...registry.sources.values()]);
  for (const listener of registry.listeners) listener();
}

/** Order, then id, so the snapshot is independent of registration order. */
export function sortSources(
  sources: readonly EpisodeIntervalSource[],
): EpisodeIntervalSource[] {
  return [...sources].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
}

/**
 * Registers one source. Returns the unregister, for HMR disposal.
 *
 * Re-registering the same id replaces the entry rather than throwing: a module
 * reload hands us a new component object for the same source, and rejecting it
 * would leave the stale component mounted for the rest of the session.
 */
export function registerEpisodeIntervalSource(
  source: EpisodeIntervalSource,
): () => void {
  if (!source.id.includes(":")) {
    throw new Error(
      `Episode interval source ids must be namespaced: ${source.id}`,
    );
  }
  registry.sources.set(source.id, source);
  rebuildSnapshot();
  return () => {
    // Only withdraw the entry still pointing at this registration — a later
    // re-registration of the same id owns it now.
    if (registry.sources.get(source.id) !== source) return;
    registry.sources.delete(source.id);
    rebuildSnapshot();
  };
}

const subscribe = (listener: () => void): (() => void) => {
  registry.listeners.add(listener);
  return () => {
    registry.listeners.delete(listener);
  };
};
const getSnapshot = () => registry.snapshot;

/** The registered sources, in order; empty before anything registers. */
export function useEpisodeIntervalSources(): readonly EpisodeIntervalSource[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
