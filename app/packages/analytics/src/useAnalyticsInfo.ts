import { useRecoilState } from "recoil";
import { analyticsInfo } from "./state";
import { AnalyticsInfo } from "./usingAnalytics";

export default function useAnalyticsInfo(): [
  AnalyticsInfo,
  (info: AnalyticsInfo) => void
] {
  return useRecoilState<AnalyticsInfo>(analyticsInfo);
}
