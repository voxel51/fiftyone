import { useFeatureCache } from "./useFeatureCache";
import { FeatureFlag } from "../client";
import { useTrackEvent } from "@fiftyone/analytics";
import { useEffect } from "react";

/**
 * Hook which provides the status of a given feature.
 *
 * @param feature Feature identifier
 * @param enableTracking If enabled, will emit tracking events
 * @returns true if the feature is enabled, else false
 */
export const useFeature = ({
  feature,
  enableTracking,
}: {
  feature: FeatureFlag;
  enableTracking?: boolean;
}): boolean => {
  const cache = useFeatureCache();
  const trackEvent = useTrackEvent();

  const isEnabled = cache.isFeatureEnabled(feature.toString());

  useEffect(() => {
    if (enableTracking) {
      trackEvent("VFF:CHECK", {
        feature,
        isEnabled,
      });
    }
  }, [enableTracking, feature, isEnabled]);

  return isEnabled;
};
