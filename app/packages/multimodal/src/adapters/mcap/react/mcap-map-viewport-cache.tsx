import React, { createContext, useContext } from "react";

const MAX_VIEWPORT_SCOPES = 16;

/** Serializable map camera state retained between nearby modal samples. */
export interface McapMapViewport {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
}

const McapMapViewportScopeContext = createContext<string | null>(null);
const viewportByScope = new Map<string, McapMapViewport>();

/**
 * Scopes speculative map warm starts to the surrounding dataset. The cache is
 * deliberately memory-only: nearby sample navigation stays warm without
 * persisting precise location data across browser sessions.
 */
export const McapMapViewportScopeProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <McapMapViewportScopeContext.Provider value={scopeKey ?? null}>
    {children}
  </McapMapViewportScopeContext.Provider>
);

/** Returns the dataset scope used for map viewport warm starts. */
export function useMcapMapViewportScope(): string | null {
  return useContext(McapMapViewportScopeContext);
}

/** Reads and promotes the most recent viewport for a dataset scope. */
export function readMcapMapViewport(
  scopeKey: string | null,
): McapMapViewport | null {
  if (!scopeKey) return null;
  const viewport = viewportByScope.get(scopeKey);
  if (!viewport) return null;

  viewportByScope.delete(scopeKey);
  viewportByScope.set(scopeKey, viewport);
  return { ...viewport };
}

/** Stores a valid viewport in the bounded, memory-only scope cache. */
export function writeMcapMapViewport(
  scopeKey: string | null,
  viewport: McapMapViewport,
): void {
  if (!scopeKey || !isValidViewport(viewport)) return;

  viewportByScope.delete(scopeKey);
  viewportByScope.set(scopeKey, { ...viewport });
  while (viewportByScope.size > MAX_VIEWPORT_SCOPES) {
    const oldest = viewportByScope.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    viewportByScope.delete(oldest);
  }
}

/** Clears all cached viewports between tests. */
export function resetMcapMapViewportCacheForTests(): void {
  viewportByScope.clear();
}

function isValidViewport(viewport: McapMapViewport): boolean {
  return (
    Number.isFinite(viewport.latitude) &&
    viewport.latitude >= -90 &&
    viewport.latitude <= 90 &&
    Number.isFinite(viewport.longitude) &&
    viewport.longitude >= -180 &&
    viewport.longitude <= 180 &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom >= 0 &&
    viewport.zoom <= 24
  );
}
