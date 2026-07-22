import React, { createContext, useContext, useMemo } from "react";
import type { EpisodeSession } from "../../../ports";

export interface LogConsoleContextValue {
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}

const LogConsoleContext = createContext<LogConsoleContextValue | null>(null);

export const LogConsoleProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}> = ({ children, session, sourceKey }) => {
  const value = useMemo(() => ({ session, sourceKey }), [session, sourceKey]);
  return (
    <LogConsoleContext.Provider value={value}>
      {children}
    </LogConsoleContext.Provider>
  );
};

export function useLogConsoleContext(): LogConsoleContextValue {
  const value = useContext(LogConsoleContext);
  if (!value) {
    throw new Error(
      "useLogConsoleContext must be used inside <LogConsoleProvider>",
    );
  }
  return value;
}
