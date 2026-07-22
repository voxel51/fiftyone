import React, { createContext, useContext } from "react";

const MapViewportScopeContext = createContext<string | null>(null);

/**
 * Scopes speculative map warm starts to the surrounding dataset. The cache is
 * deliberately memory-only: nearby sample navigation stays warm without
 * persisting precise location data across browser sessions.
 */
export const MapViewportScopeProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <MapViewportScopeContext.Provider value={scopeKey ?? null}>
    {children}
  </MapViewportScopeContext.Provider>
);

/** Returns the dataset scope used for map viewport warm starts. */
export function useMapViewportScope(): string | null {
  return useContext(MapViewportScopeContext);
}
