import { useFeatureCache } from "./useFeatureCache";
import { FeatureFlag } from "../client";

/**
 * Hook which provides the status of a given feature.
 *
 * @param feature Feature identifier
 * @returns true if the feature is enabled, else false
 */
export const useFeature = ({ feature }: { feature: FeatureFlag }): boolean => {
  const cache = useFeatureCache();
  return cache.isFeatureEnabled(feature.toString());
};
