import React, { createContext, useContext, useMemo } from "react";
import type { EpisodeSession } from "../../ports";

export interface EpisodeLogConsoleContextValue {
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}

const EpisodeLogConsoleContext =
  createContext<EpisodeLogConsoleContextValue | null>(null);

export const EpisodeLogConsoleProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}> = ({ children, session, sourceKey }) => {
  const value = useMemo(() => ({ session, sourceKey }), [session, sourceKey]);
  return (
    <EpisodeLogConsoleContext.Provider value={value}>
      {children}
    </EpisodeLogConsoleContext.Provider>
  );
};

export function useEpisodeLogConsoleContext(): EpisodeLogConsoleContextValue {
  const value = useContext(EpisodeLogConsoleContext);
  if (!value) {
    throw new Error(
      "useEpisodeLogConsoleContext must be used inside <EpisodeLogConsoleProvider>",
    );
  }
  return value;
}
