import React, { createContext, useContext, useMemo } from "react";
import type { EpisodeSession, SourceReadBudgetAccount } from "../../../ports";

export interface LogConsoleContextValue {
  readonly budgetAccount: SourceReadBudgetAccount | null;
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}

const LogConsoleContext = createContext<LogConsoleContextValue | null>(null);

export const LogConsoleProvider: React.FC<{
  readonly budgetAccount?: SourceReadBudgetAccount | null;
  readonly children: React.ReactNode;
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}> = ({ budgetAccount = null, children, session, sourceKey }) => {
  const value = useMemo(
    () => ({ budgetAccount, session, sourceKey }),
    [budgetAccount, session, sourceKey],
  );
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
