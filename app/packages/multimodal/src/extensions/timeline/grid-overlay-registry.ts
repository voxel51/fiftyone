import { useSyncExternalStore, type ComponentType } from "react";
import type { IntervalTileContext } from "../host/tile-context";

/**
 * Grid-tile overlay components an edition contributes (e.g. an
 * embedding-match time-lane). Mirrors the timeline-extension registry: the
 * OSS-synced grid renders whatever is registered and renders nothing before
 * registration, so no OSS-synced file ever imports edition code.
 */

/** Every tile passes what identifies it; a custom-renderer tile's renderer
 * context satisfies this too. */
export type GridOverlayComponent = ComponentType<{
  readonly ctx: IntervalTileContext;
}>;

interface GridOverlayRegistry {
  readonly overlays: Set<GridOverlayComponent>;
  readonly listeners: Set<() => void>;
  snapshot: readonly GridOverlayComponent[];
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:mcap-grid-overlay-registry",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const registry = (globalRegistry[REGISTRY_KEY] ??= {
  overlays: new Set(),
  listeners: new Set(),
  snapshot: [],
} satisfies GridOverlayRegistry) as GridOverlayRegistry;

function rebuildSnapshot(): void {
  registry.snapshot = [...registry.overlays];
  for (const listener of registry.listeners) listener();
}

/** Registers one overlay component. Registering the same component twice is
 * an idempotent no-op for module reloads. Returns the unregister, for HMR
 * disposal. */
export function registerGridOverlay(overlay: GridOverlayComponent): () => void {
  if (registry.overlays.has(overlay)) return () => undefined;
  registry.overlays.add(overlay);
  rebuildSnapshot();
  return () => {
    if (!registry.overlays.delete(overlay)) return;
    rebuildSnapshot();
  };
}

const subscribe = (listener: () => void): (() => void) => {
  registry.listeners.add(listener);
  return () => registry.listeners.delete(listener);
};
const getSnapshot = () => registry.snapshot;

// Keyed by the overlay's own reference (stable per registration), not its
// position in the registry's array — an earlier overlay unregistering must
// not shift a later one's key and force it to remount.
const overlayIds = new WeakMap<GridOverlayComponent, number>();
let nextOverlayId = 0;

/** A React key for one registered overlay, the same in every host. */
export function gridOverlayKey(overlay: GridOverlayComponent): number {
  let id = overlayIds.get(overlay);
  if (id === undefined) {
    id = nextOverlayId++;
    overlayIds.set(overlay, id);
  }
  return id;
}

/** The registered overlays; empty before anything registers. */
export function useGridOverlays(): readonly GridOverlayComponent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
