import { atom, useAtomValue, useSetAtom } from "jotai";
import { FeatureCache } from "../utils";
import { useEffect } from "react";
import { listEnabledFeatures } from "../client";

/**
 * Cache mapping feature flags to their status.
 */
const featureCacheAtom = atom<FeatureCache>(new FeatureCache());
const isInitializedAtom = atom<boolean>(false);
const isFetchingAtom = atom<boolean>(false);

/**
 * Write-only atom which handles cache initialization.
 *
 * This method is idempotent; if a request is already in flight or has already
 * resolved, another request will not be made.
 */
const initializeFeaturesAtom = atom(null, async (get, set) => {
  if (get(isInitializedAtom) || get(isFetchingAtom)) {
    return;
  }

  set(isFetchingAtom, true);

  try {
    const res = await listEnabledFeatures();
    const cache = get(featureCacheAtom);
    cache.clear();
    res?.features?.forEach((feature) => cache.setFeature(feature, true));
    set(isInitializedAtom, true);
  } catch (err) {
    console.warn("Failed to fetch features", err);
  } finally {
    set(isFetchingAtom, false);
  }
});

/**
 * Hook which provides access to a shared cache of enabled features.
 */
export const useFeatureCache = (): {
  cache: FeatureCache;
  isResolved: boolean;
} => {
  const cache = useAtomValue(featureCacheAtom);
  const isInitialized = useAtomValue(isInitializedAtom);
  const initializeCache = useSetAtom(initializeFeaturesAtom);

  useEffect(() => {
    initializeCache();
  }, [cache]);

  return { cache, isResolved: isInitialized };
};
