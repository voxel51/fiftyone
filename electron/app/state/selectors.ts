import { selector } from "recoil";

import {
  currentIndex,
  mousePosition,
  viewCount,
  mainSize,
  mainTop,
  currentListHeight,
  isDraggingIndicator,
} from "./atoms";
import { getAction } from "connected-react-router";

export const indicatorIndex = selector({
  key: "indicatorIndex",
  get: ({ get }) => {
    const mp = get(mousePosition);
    const mt = get(mainTop);
    const ms = get(mainSize);
    const vc = get(viewCount);
    return Math.min(vc - 1, parseInt(((mp[1] - mt) / (ms[1] - 16)) * (vc - 1)));
  },
});

export const indicatorIndexPercentage = selector({
  key: "indicatorIndexPercentage",
  get: ({ get }) => {
    const vc = get(viewCount);
    const ii = get(indicatorIndex);
    const perc = vc === 0 ? 0 : ii / (vc - 1);
    return perc;
  },
});

export const currentIndexIndicatorTop = selector({
  key: "currentIndexIndicatorTop",
  get: ({ get }) => {
    const cip = get(currentIndexPercentage);
    const [unused, mh] = get(mainSize);
    return Math.min(mh - 3, Math.max(32, cip * (mh - 35) + 32));
  },
});

export const currentIndexPercentage = selector({
  key: "currentIndexPercentage",
  get: ({ get }) => {
    const vc = get(viewCount);
    const ci = get(currentIndex);
    const perc = vc === 0 ? 0 : ci / (vc - 1);
    return perc;
  },
});

export const numSections = selector({
  key: "numSections",
  get: ({ get }) => get(viewCount) / 5,
});

export const sections = selector({
  key: "sections",
  get: ({ get }) => {
    const ns = get(numSections);
    return [...Array(ns).keys()].map((i) => 5 * i);
  },
});

export const currentListTop = selector({
  key: "currentListTop",
  get: ({ get }) => {
    const clh = get(currentListHeight);
    const idi = get(isDraggingIndicator);
    const [unused, mh] = get(mainSize);
    const perc = idi
      ? get(indicatorIndexPercentage)
      : get(currentIndexPercentage);
    console.log(idi, mh, clh, perc);
    return Math.max(0, clh - mh) * perc;
  },
});
