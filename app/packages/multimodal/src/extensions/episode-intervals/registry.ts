import { useSyncExternalStore } from "react";
import { createExtensionRegistry } from "../host/registry";
import type { EpisodeIntervalSource } from "./types";

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:episode-interval-source-registry",
);
const registry = createExtensionRegistry<EpisodeIntervalSource>(
  REGISTRY_KEY,
  "episode interval source",
  { duplicateIdPolicy: "replace" },
);

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
  return registry.register(source);
}

/** The registered sources, in order; empty before anything registers. */
export function useEpisodeIntervalSources(): readonly EpisodeIntervalSource[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}
