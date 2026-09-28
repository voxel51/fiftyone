import { useSyncExternalStore } from "react";
import { createExtensionRegistry } from "../host/registry";
import type { EpisodeHeaderAction } from "./types";

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:episode-header-action-registry",
);
const registry = createExtensionRegistry<EpisodeHeaderAction>(
  REGISTRY_KEY,
  "episode header action",
);

/** Registers one product-neutral episode header action. */
export function registerEpisodeHeaderAction(
  action: EpisodeHeaderAction,
): () => void {
  const separator = action.id.indexOf(":");
  if (separator <= 0 || separator === action.id.length - 1) {
    throw new Error(
      `Episode header action ids must be namespaced: ${action.id}`,
    );
  }
  return registry.register(action);
}

/** Returns registered actions in deterministic product-policy order. */
export function useEpisodeHeaderActions(): readonly EpisodeHeaderAction[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
}

/** Test-only reset kept out of the public package entrypoint. */
export function resetEpisodeHeaderActionsForTests(): void {
  registry.resetForTests();
}
