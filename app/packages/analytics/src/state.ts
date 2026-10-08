import { atom } from "@fiftyone/reverb";
import type { AnalyticsInfo } from "./usingAnalytics";

export const analyticsInfo = atom<AnalyticsInfo>({
  key: "analyticsInfo",
  default: null,
});
