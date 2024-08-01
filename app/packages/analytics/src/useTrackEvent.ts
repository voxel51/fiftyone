import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { analyticsInfo } from "./state";
import type { AnalyticsInfo } from "./usingAnalytics";
import usingAnalytics from "./usingAnalytics";

/**
 * Track an event. This can be called from any component to track an event, however
 * only when a user is opted in to analytics, will an event be sent to the analytics
 * service.
 */
export default function useTrackEvent() {
  const info = useRecoilValue<AnalyticsInfo>(analyticsInfo);
  return useCallback(
    (eventName: string, properties?: Record<string, any>) => {
      const analytics = usingAnalytics(info);
      analytics.trackEvent(eventName, properties);
    },
    [info]
  );
}
