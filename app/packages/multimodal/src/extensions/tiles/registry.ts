import type { EpisodeTileExtension, EpisodeTileExtensionId } from "./types";

interface EpisodeTileExtensionRegistry {
  readonly extensions: Map<EpisodeTileExtensionId, EpisodeTileExtension>;
  snapshot: readonly EpisodeTileExtension[];
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:episode-tile-extension-registry",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const registry = (globalRegistry[REGISTRY_KEY] ??=
  createRegistry()) as EpisodeTileExtensionRegistry;

function createRegistry(): EpisodeTileExtensionRegistry {
  return { extensions: new Map(), snapshot: [] };
}

function rebuildSnapshot(): void {
  registry.snapshot = [...registry.extensions.values()].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
}

/**
 * Registers a tile kind compiled into the current product build.
 *
 * IDs are namespaced so persisted layouts remain unambiguous. Registering the
 * same object twice is harmless for module reloads; conflicting reuse fails.
 */
export function registerEpisodeTileExtension(
  extension: EpisodeTileExtension,
): () => void {
  if (!isEpisodeTileExtensionId(extension.id)) {
    throw new Error(
      `Episode tile extension ids must be namespaced: ${extension.id}`,
    );
  }
  const existing = registry.extensions.get(extension.id);
  if (existing === extension) return () => undefined;
  if (existing) {
    throw new Error(`Duplicate episode tile extension id: ${extension.id}`);
  }
  registry.extensions.set(extension.id, extension);
  rebuildSnapshot();

  let active = true;
  return () => {
    if (!active || registry.extensions.get(extension.id) !== extension) return;
    active = false;
    registry.extensions.delete(extension.id);
    rebuildSnapshot();
  };
}

/** Returns the build's tile contributions in deterministic product order. */
export function getEpisodeTileExtensions(): readonly EpisodeTileExtension[] {
  return registry.snapshot;
}

/** Returns one registered contribution, or null for built-in and unknown ids. */
export function getEpisodeTileExtension(
  id: string,
): EpisodeTileExtension | null {
  return isEpisodeTileExtensionId(id)
    ? (registry.extensions.get(id) ?? null)
    : null;
}

/** Recognizes the required `namespace:tile` extension-id shape. */
export function isEpisodeTileExtensionId(
  value: string,
): value is EpisodeTileExtensionId {
  const separator = value.indexOf(":");
  return separator > 0 && separator < value.length - 1;
}

/** Test-only reset kept out of the public package entrypoint. */
export function resetEpisodeTileExtensionsForTests(): void {
  if (registry.extensions.size === 0) return;
  registry.extensions.clear();
  rebuildSnapshot();
}
