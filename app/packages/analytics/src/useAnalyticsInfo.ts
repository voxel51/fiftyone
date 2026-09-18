import { useReverbState } from "@fiftyone/reverb";
import { analyticsInfo } from "./state";
import type { AnalyticsInfo } from "./usingAnalytics";

export default function useAnalyticsInfo(): [
  AnalyticsInfo,
  (info: AnalyticsInfo) => void,
] {
  return useReverbState<AnalyticsInfo>(analyticsInfo);
}
