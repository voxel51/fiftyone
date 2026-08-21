import { createContext, useContext, type ReactNode } from "react";

const EpisodeSourceReadyContext = createContext(false);

/** Publishes the current source's real playhead-ready edge to idle workers. */
export function EpisodeSourceReadyProvider({
  children,
  ready,
}: {
  readonly children: ReactNode;
  readonly ready: boolean;
}) {
  return (
    <EpisodeSourceReadyContext.Provider value={ready}>
      {children}
    </EpisodeSourceReadyContext.Provider>
  );
}

/** True only after the current source has committed real playhead data. */
export function useEpisodeSourceReady(): boolean {
  return useContext(EpisodeSourceReadyContext);
}
