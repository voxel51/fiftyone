import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createMcap3dViewStateStore,
  type Mcap3dViewStateStore,
} from "./mcap-3d-view-state";

const Mcap3dViewStateStoreContext = createContext<Mcap3dViewStateStore | null>(
  null,
);

const MAX_CACHED_VIEW_STATE_SCOPES = 32;
const viewStateStoresByScope = new Map<
  string,
  {
    activeMounts: number;
    readonly store: Mcap3dViewStateStore;
  }
>();

/**
 * Provides memory-only 3D navigation state for one dataset/media-field
 * inspection scope. A scoped store survives modal teardown so an accidental
 * close/reopen preserves the camera, but naturally disappears on page reload.
 * The store remains non-reactive: camera sampling never invalidates the shell.
 */
export const Mcap3dViewStateProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
  readonly store?: Mcap3dViewStateStore;
}> = ({ children, scopeKey, store: suppliedStore }) => {
  const [ownedStore] = useState(createMcap3dViewStateStore);
  const scopedStore = useMemo(
    () => (scopeKey ? viewStateStoreForScope(scopeKey) : null),
    [scopeKey],
  );
  const store = suppliedStore ?? scopedStore ?? ownedStore;

  // This effect retains a scoped store for the provider's mounted lifetime.
  useEffect(() => {
    if (!scopeKey || suppliedStore || store !== scopedStore) return undefined;
    return retainViewStateScope(scopeKey, store);
  }, [scopeKey, scopedStore, store, suppliedStore]);

  return (
    <Mcap3dViewStateStoreContext.Provider value={store}>
      {children}
    </Mcap3dViewStateStoreContext.Provider>
  );
};

/** Returns an explicit store or the store owned by the nearest provider. */
export function useMcap3dViewStateStore(
  suppliedStore?: Mcap3dViewStateStore,
): Mcap3dViewStateStore {
  const contextStore = useContext(Mcap3dViewStateStoreContext);
  const store = suppliedStore ?? contextStore;
  if (!store) {
    throw new Error(
      "useMcap3dViewStateStore must be used inside <Mcap3dViewStateProvider>",
    );
  }
  return store;
}

/** Clears the inspection-session registry between tests. */
export function __resetMcap3dViewStateScopesForTests() {
  viewStateStoresByScope.clear();
}

function viewStateStoreForScope(scopeKey: string): Mcap3dViewStateStore {
  const existing = viewStateStoresByScope.get(scopeKey);
  if (existing) {
    // Map insertion order doubles as LRU order without a second index.
    viewStateStoresByScope.delete(scopeKey);
    viewStateStoresByScope.set(scopeKey, existing);
    return existing.store;
  }

  const store = createMcap3dViewStateStore();
  viewStateStoresByScope.set(scopeKey, { activeMounts: 0, store });
  evictInactiveViewStateScopesToLimit(scopeKey);
  return store;
}

function retainViewStateScope(
  scopeKey: string,
  store: Mcap3dViewStateStore,
): () => void {
  const entry = viewStateStoresByScope.get(scopeKey);
  if (!entry || entry.store !== store) return () => undefined;
  entry.activeMounts += 1;

  return () => {
    const current = viewStateStoresByScope.get(scopeKey);
    if (!current || current.store !== store) return;
    current.activeMounts = Math.max(0, current.activeMounts - 1);
    evictInactiveViewStateScopesToLimit();
  };
}

function evictInactiveViewStateScopesToLimit(protectedScopeKey?: string) {
  while (viewStateStoresByScope.size > MAX_CACHED_VIEW_STATE_SCOPES) {
    const oldestInactive = [...viewStateStoresByScope].find(
      ([key, entry]) => key !== protectedScopeKey && entry.activeMounts === 0,
    );
    if (!oldestInactive) return;
    viewStateStoresByScope.delete(oldestInactive[0]);
  }
}
