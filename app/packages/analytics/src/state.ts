import { atom } from "recoil";
import type { AnalyticsInfo } from "./usingAnalytics";

export const analyticsInfo = atom<AnalyticsInfo>({
  key: "analyticsInfo",
  default: null,
});
