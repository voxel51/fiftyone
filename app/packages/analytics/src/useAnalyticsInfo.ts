import { useRecoilState } from "recoil";
import { analyticsInfo } from "./state";
import type { AnalyticsInfo } from "./usingAnalytics";

export default function useAnalyticsInfo(): [
  AnalyticsInfo,
  (info: AnalyticsInfo) => void
] {
  return useRecoilState<AnalyticsInfo>(analyticsInfo);
}
