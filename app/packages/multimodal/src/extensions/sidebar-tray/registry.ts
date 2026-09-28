import { useSyncExternalStore } from "react";
import { createExtensionRegistry } from "../host/registry";
import type { SidebarTrayExtension } from "./types";

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:sidebar-tray-extension-registry",
);
const registry = createExtensionRegistry<SidebarTrayExtension>(
  REGISTRY_KEY,
  "sidebar tray extension",
  // A tray's implementation may live in another package and register from a
  // side-effect module the app shell imports. Under Next/SWC that module has
  // no disposal hook (`import.meta.hot` is `undefined`), so a fast refresh
  // re-evaluates it and re-registers a fresh object under the same id. Let the
  // newcomer win rather than throwing on a reload nothing can prevent.
  { duplicateIdPolicy: "replace" },
);

/**
 * Registers one product-neutral sidebar tray.
 *
 * Registering the same object twice is an idempotent no-op for module reloads.
 * A different object reusing an existing id replaces it — see the registry's
 * duplicate-id policy above.
 */
export function registerSidebarTrayExtension(
  extension: SidebarTrayExtension,
): () => void {
  if (!isNamespacedId(extension.id)) {
    throw new Error(
      `Sidebar tray extension ids must be namespaced: ${extension.id}`,
    );
  }
  return registry.register(extension);
}

/** Returns the registered trays in deterministic product-policy order. */
export function useSidebarTrayExtensions(): readonly SidebarTrayExtension[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}

/** Recognizes the required `namespace:tray` extension-id shape. */
function isNamespacedId(value: string): boolean {
  const separator = value.indexOf(":");
  return separator > 0 && separator < value.length - 1;
}

/** Test-only reset kept out of the public package barrel. */
export function resetSidebarTrayExtensionsForTests(): void {
  registry.resetForTests();
}
