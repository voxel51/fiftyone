import { atom } from "recoil";
import { AnalyticsInfo } from "./usingAnalytics";

export const analyticsInfo = atom<AnalyticsInfo>({
  key: "analyticsInfo",
  default: null,
});
