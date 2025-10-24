import { atom, useAtom, useAtomValue } from "jotai";
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
 * Hook which provides access to a shared cache of enabled features.
 */
export const useFeatureCache = (): FeatureCache => {
  const cache = useAtomValue(featureCacheAtom);
  const [isInitialized, setIsInitialized] = useAtom(isInitializedAtom);
  const [isFetching, setIsFetching] = useAtom(isFetchingAtom);

  useEffect(() => {
    if (!isInitialized && !isFetching) {
      listEnabledFeatures()
        .then((res) => {
          cache.clear();
          res?.features?.forEach((feature) => cache.setFeature(feature, true));
        })
        .finally(() => {
          setIsFetching(false);
          setIsInitialized(true);
        });
    }
  }, [cache]);

  return cache;
};
