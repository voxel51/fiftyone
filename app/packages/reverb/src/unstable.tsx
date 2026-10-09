/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Provider, useStore } from "jotai";
import { INTERNAL_getBuildingBlocksRev3 as buildingBlocks } from "jotai/vanilla/internals";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { type Loadable, loadable } from "./loadable";
import { epochOf } from "./selector";
import { snapshot } from "./snapshot";
import { observeTransactions, type Store } from "./transaction";
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

/**
 * State's value only while a subscriber keeps it current, so the read never
 * starts work (a query, say) that nothing on screen asked for. Undefined when
 * nothing is subscribed.
 */
export function peekReverbValue<T>(
  store: Store,
  state: ReverbValue<T>,
): Loadable<T> | undefined {
  const [, mounted] = buildingBlocks(store);

  return mounted.has(state)
    ? loadable(store.get(state) as T | Promise<T>)
    : undefined;
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
  const store = useStore();

  useEffect(
    () =>
      observeTransactions(store, (current) =>
        observer({ snapshot: snapshot(current) }),
      ),
    [observer, store],
  );
}

/** Shares this store with another React root. */
export function useReverbBridge(): React.FC<{ children?: React.ReactNode }> {
  const store = useStore();

  return useMemo(() => {
    const ReverbBridge = ({ children }: { children?: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    return ReverbBridge;
  }, [store]);
}
