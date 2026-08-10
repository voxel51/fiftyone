import { useSyncExternalStore } from "react";
import { createExtensionRegistry } from "../host/registry";
import type { TimelineExtension } from "./types";

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:timeline-extension-registry",
);
const registry = createExtensionRegistry<TimelineExtension>(
  REGISTRY_KEY,
  "timeline extension",
);

/**
 * Registers one product-neutral timeline extension.
 *
 * Registering the same object twice is an idempotent no-op for module reloads.
 * A different extension reusing an existing id is an architectural error and
 * fails loudly instead of making product behavior depend on import order.
 */
export function registerTimelineExtension(
  extension: TimelineExtension,
): () => void {
  if (!extension.id.includes(":")) {
    throw new Error(
      `Timeline extension ids must be namespaced: ${extension.id}`,
    );
  }
  return registry.register(extension);
}

/** Returns the registered extensions in deterministic product-policy order. */
export function useTimelineExtensions(): readonly TimelineExtension[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}

/** Test-only reset kept out of the public package barrel. */
export function resetTimelineExtensionsForTests(): void {
  registry.resetForTests();
}
