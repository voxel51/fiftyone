import type { EpisodeTileExtension, EpisodeTileExtensionId } from "./types";
import { createExtensionRegistry } from "../host/registry";

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:episode-tile-extension-registry",
);
const registry = createExtensionRegistry<EpisodeTileExtension>(
  REGISTRY_KEY,
  "episode tile extension",
);

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
  return registry.register(extension);
}

/** Returns the build's tile contributions in deterministic product order. */
export function getEpisodeTileExtensions(): readonly EpisodeTileExtension[] {
  return registry.getSnapshot();
}

/** Returns one registered contribution, or null for built-in and unknown ids. */
export function getEpisodeTileExtension(
  id: string,
): EpisodeTileExtension | null {
  return isEpisodeTileExtensionId(id) ? (registry.get(id) ?? null) : null;
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
  registry.resetForTests();
}
