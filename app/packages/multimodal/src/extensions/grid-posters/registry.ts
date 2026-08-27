import { useSyncExternalStore } from "react";

import type { GridPosterProvider } from "./types";

interface GridPosterProviderState {
  readonly listeners: Set<() => void>;
  provider: GridPosterProvider | null;
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:grid-poster-provider-registry",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const state = (globalRegistry[REGISTRY_KEY] ??= {
  listeners: new Set(),
  provider: null,
}) as GridPosterProviderState;

/** Registers the optional precomputed-poster provider for this product build. */
export function registerGridPosterProvider(
  provider: GridPosterProvider,
): () => void {
  if (!provider.id.includes(":")) {
    throw new Error(
      `Grid poster provider ids must be namespaced: ${provider.id}`,
    );
  }
  if (state.provider === provider) return () => undefined;
  if (state.provider) {
    throw new Error("A grid poster provider is already registered");
  }

  state.provider = provider;
  emitChange();
  let active = true;
  return () => {
    if (!active || state.provider !== provider) return;
    active = false;
    state.provider = null;
    emitChange();
  };
}

/** Returns the precomputed-poster provider compiled into this product build. */
export function getGridPosterProvider(): GridPosterProvider | null {
  return state.provider;
}

/** React subscription to the current product's optional poster provider. */
export function useGridPosterProvider(): GridPosterProvider | null {
  return useSyncExternalStore(
    subscribe,
    getGridPosterProvider,
    getGridPosterProvider,
  );
}

/** Test-only reset kept out of the public package barrel. */
export function resetGridPosterProviderForTests(): void {
  if (!state.provider) return;
  state.provider = null;
  emitChange();
}

function subscribe(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function emitChange(): void {
  for (const listener of state.listeners) listener();
}
