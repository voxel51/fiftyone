import { createContext, useContext, useId, type ReactNode } from "react";

const ReadoutScope = createContext<string | null>(null);

/** Hover and lane names belong to a tile, even when an episode appears twice. */
export function TileLaneScope({ children }: { readonly children: ReactNode }) {
  const id = useId();
  return <ReadoutScope.Provider value={id}>{children}</ReadoutScope.Provider>;
}

/** Keep episode identity for playback, and scope each tile's readout separately. */
export function useLaneReadoutKey(episodeId: string | undefined) {
  const scope = useContext(ReadoutScope);
  return episodeId ? (scope ? `${episodeId}:${scope}` : episodeId) : undefined;
}
