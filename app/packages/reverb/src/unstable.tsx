/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Provider, useStore } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { epochOf } from "./selector";
import { snapshot } from "./snapshot";
import { observeTransactions } from "./transaction";
import type { ReverbValue, SnapshotInterface } from "./types";

/** Forces derived state to recompute, for a source outside the store. */
export function useReverbRefresher<T>(state: ReverbValue<T>): () => void {
  const store = useStore();

  return useCallback(() => {
    const epoch = epochOf(state);

    if (epoch) {
      store.set(epoch, (current) => current + 1);
    }
  }, [store, state]);
}

export const useReverbSnapshot = (): SnapshotInterface => {
  const store = useStore();

  return useMemo(() => snapshot(store), [store]);
};

/**
 * Sees writes made through a transaction or callback. A bare set does not pass
 * through here, unlike the hook this replaces.
 */
export function useTransactionObserver(
  observer: (accessors: { snapshot: SnapshotInterface }) => void,
): void {
  useEffect(
    () =>
      observeTransactions((store) => observer({ snapshot: snapshot(store) })),
    [observer],
  );
}

/** Shares this store with another React root. */
export function useReverbBridge(): React.FC<{ children?: React.ReactNode }> {
  const store = useStore();

  return useMemo(
    () =>
      ({ children }) => <Provider store={store}>{children}</Provider>,
    [store],
  );
}
