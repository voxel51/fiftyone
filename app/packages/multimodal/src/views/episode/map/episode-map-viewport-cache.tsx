import React, { createContext, useContext } from "react";

const EpisodeMapViewportScopeContext = createContext<string | null>(null);

/**
 * Scopes speculative map warm starts to the surrounding dataset. The cache is
 * deliberately memory-only: nearby sample navigation stays warm without
 * persisting precise location data across browser sessions.
 */
export const EpisodeMapViewportScopeProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
}> = ({ children, scopeKey }) => (
  <EpisodeMapViewportScopeContext.Provider value={scopeKey ?? null}>
    {children}
  </EpisodeMapViewportScopeContext.Provider>
);

/** Returns the dataset scope used for map viewport warm starts. */
export function useEpisodeMapViewportScope(): string | null {
  return useContext(EpisodeMapViewportScopeContext);
}
