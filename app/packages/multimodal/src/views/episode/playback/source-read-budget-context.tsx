/**
 * The recording's shared read allowance, for surfaces that need to say why
 * their data stopped arriving and offer the viewer the one way to change it.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type {
  SourceReadBudgetAccount,
  SourceReadBudgetStanding,
} from "../../../ports";

const SourceReadBudgetContext = createContext<SourceReadBudgetAccount | null>(
  null,
);

const noSubscribe = () => () => undefined;
const NO_STANDING: SourceReadBudgetStanding | null = null;

export const SourceReadBudgetProvider: React.FC<{
  readonly account: SourceReadBudgetAccount | null;
  readonly children: React.ReactNode;
}> = ({ account, children }) => (
  <SourceReadBudgetContext.Provider value={account}>
    {children}
  </SourceReadBudgetContext.Provider>
);

/** Whether the allowance has refused work, and whether the viewer lifted it. */
export function useSourceReadBudgetStanding(): SourceReadBudgetStanding | null {
  const account = useContext(SourceReadBudgetContext);
  const subscribe = useMemo(
    () => (account ? account.subscribe : noSubscribe),
    [account],
  );
  // The account rebuilds its standing object per call, and the store hook
  // compares snapshots by identity, so the last value is handed back
  // unchanged until one of its fields differs.
  const last = useRef<SourceReadBudgetStanding | null>(NO_STANDING);
  const read = useCallback(() => {
    const next = account ? account.standing() : NO_STANDING;
    const previous = last.current;
    if (
      previous === next ||
      (previous !== null &&
        next !== null &&
        previous.exhausted === next.exhausted &&
        previous.lifted === next.lifted)
    )
      return previous;
    last.current = next;
    return next;
  }, [account]);
  return useSyncExternalStore(subscribe, read, read);
}

/** The viewer's explicit choice to read this recording without a limit. */
export function useLiftSourceReadLimit(): (() => void) | null {
  const account = useContext(SourceReadBudgetContext);
  return useMemo(() => (account ? () => account.lift() : null), [account]);
}
