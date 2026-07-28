import { useSyncExternalStore } from "react";
import type { McapTimelineExtension } from "./types";

interface McapTimelineExtensionRegistry {
  readonly extensions: Map<string, McapTimelineExtension>;
  readonly listeners: Set<() => void>;
  snapshot: readonly McapTimelineExtension[];
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:mcap-timeline-extension-registry",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const registry = (globalRegistry[REGISTRY_KEY] ??=
  createRegistry()) as McapTimelineExtensionRegistry;

function createRegistry(): McapTimelineExtensionRegistry {
  return {
    extensions: new Map(),
    listeners: new Set(),
    snapshot: [],
  };
}

function rebuildSnapshot(): void {
  registry.snapshot = [...registry.extensions.values()].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  for (const listener of registry.listeners) listener();
}

/**
 * Registers one product-neutral MCAP timeline extension.
 *
 * Registering the same object twice is an idempotent no-op for module reloads.
 * A different extension reusing an existing id is an architectural error and
 * fails loudly instead of making product behavior depend on import order.
 */
export function registerMcapTimelineExtension(
  extension: McapTimelineExtension,
): () => void {
  if (!extension.id.includes(":")) {
    throw new Error(
      `MCAP timeline extension ids must be namespaced: ${extension.id}`,
    );
  }
  const existing = registry.extensions.get(extension.id);
  if (existing === extension) return () => undefined;
  if (existing) {
    throw new Error(`Duplicate MCAP timeline extension id: ${extension.id}`);
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

/** Returns the registered extensions in deterministic product-policy order. */
export function useMcapTimelineExtensions(): readonly McapTimelineExtension[] {
  return useSyncExternalStore(
    (listener) => {
      registry.listeners.add(listener);
      return () => registry.listeners.delete(listener);
    },
    () => registry.snapshot,
    () => registry.snapshot,
  );
}

/** Test-only reset kept out of the public package barrel. */
export function resetMcapTimelineExtensionsForTests(): void {
  if (registry.extensions.size === 0) return;
  registry.extensions.clear();
  rebuildSnapshot();
}
