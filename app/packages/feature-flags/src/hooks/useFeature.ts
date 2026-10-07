import { useFeatureCache } from "./useFeatureCache";
import { FeatureFlag } from "../client";
import { useTrackEvent } from "@fiftyone/analytics";
import { useEffect } from "react";

/**
 * Hook which provides the status of a given feature.
 *
 * @param feature Feature identifier
 * @param enableTracking If enabled, will emit tracking events
 */
export const useFeature = ({
  feature,
  enableTracking,
}: {
  feature: FeatureFlag;
  enableTracking?: boolean;
}): { isEnabled: boolean; isResolved: boolean } => {
  const { cache, isResolved } = useFeatureCache();
  const trackEvent = useTrackEvent();

  const isEnabled = cache.isFeatureEnabled(feature.toString());

  useEffect(() => {
    if (enableTracking && isResolved) {
      trackEvent("VFF:CHECK", {
        feature,
        isEnabled,
      });
    }
    // track flag checks, not analytics-info changes (trackEvent's identity
    // follows the analytics info)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [enableTracking, feature, isEnabled, isResolved]);

  return { isEnabled, isResolved };
};
