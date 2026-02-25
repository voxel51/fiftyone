import { atom } from "recoil";
import type { AnalyticsInfo } from "./usingAnalytics";

export const analyticsInfo = atom<AnalyticsInfo | null>({
  key: "analyticsInfo",
  default: null,
});
