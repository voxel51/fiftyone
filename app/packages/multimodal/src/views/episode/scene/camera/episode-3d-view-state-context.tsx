import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createEpisode3dViewStateStore,
  type Episode3dViewStateStore,
} from "./episode-3d-view-state";

const Episode3dViewStateStoreContext =
  createContext<Episode3dViewStateStore | null>(null);

const MAX_CACHED_VIEW_STATE_SCOPES = 32;
const viewStateStoresByScope = new Map<
  string,
  {
    activeMounts: number;
    readonly store: Episode3dViewStateStore;
  }
>();

/**
 * Provides memory-only 3D navigation state for one dataset/media-field
 * inspection scope. A scoped store survives modal teardown so an accidental
 * close/reopen preserves the camera, but naturally disappears on page reload.
 * The store remains non-reactive: camera sampling never invalidates the shell.
 */
export const Episode3dViewStateProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
  readonly store?: Episode3dViewStateStore;
}> = ({ children, scopeKey, store: suppliedStore }) => {
  const [ownedStore] = useState(createEpisode3dViewStateStore);
  const scopedStoreCandidate = useMemo(
    () =>
      scopeKey && !suppliedStore
        ? (viewStateStoresByScope.get(scopeKey)?.store ??
          createEpisode3dViewStateStore())
        : null,
    [scopeKey, suppliedStore],
  );
  const [resolvedScopedStore, setResolvedScopedStore] = useState<{
    readonly candidate: Episode3dViewStateStore;
    readonly scopeKey: string;
    readonly store: Episode3dViewStateStore;
  } | null>(null);
  const scopedStore =
    resolvedScopedStore &&
    resolvedScopedStore.scopeKey === scopeKey &&
    resolvedScopedStore.candidate === scopedStoreCandidate
      ? resolvedScopedStore.store
      : scopedStoreCandidate;
  const store = suppliedStore ?? scopedStore ?? ownedStore;

  // This effect registers and retains a scoped store only after commit.
  useEffect(() => {
    if (
      !scopeKey ||
      suppliedStore ||
      !scopedStoreCandidate ||
      store !== scopedStore
    ) {
      return undefined;
    }
    const existing = viewStateStoresByScope.get(scopeKey);
    if (existing && existing.store !== store) {
      setResolvedScopedStore({
        candidate: scopedStoreCandidate,
        scopeKey,
        store: existing.store,
      });
      return undefined;
    }
    if (!existing) {
      viewStateStoresByScope.set(scopeKey, { activeMounts: 0, store });
    } else {
      // Map insertion order doubles as LRU order without a second index.
      viewStateStoresByScope.delete(scopeKey);
      viewStateStoresByScope.set(scopeKey, existing);
    }
    const release = retainViewStateScope(scopeKey, store);
    evictInactiveViewStateScopesToLimit(scopeKey);
    return release;
  }, [scopeKey, scopedStore, scopedStoreCandidate, store, suppliedStore]);

  return (
    <Episode3dViewStateStoreContext.Provider value={store}>
      {children}
    </Episode3dViewStateStoreContext.Provider>
  );
};

/** Returns an explicit store or the store owned by the nearest provider. */
export function useEpisode3dViewStateStore(
  suppliedStore?: Episode3dViewStateStore,
): Episode3dViewStateStore {
  const contextStore = useContext(Episode3dViewStateStoreContext);
  const store = suppliedStore ?? contextStore;
  if (!store) {
    throw new Error(
      "useEpisode3dViewStateStore must be used inside <Episode3dViewStateProvider>",
    );
  }
  return store;
}

/** Clears the inspection-session registry between tests. */
export function __resetEpisode3dViewStateScopesForTests() {
  viewStateStoresByScope.clear();
}

function retainViewStateScope(
  scopeKey: string,
  store: Episode3dViewStateStore,
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
