import { selector } from "recoil";

import {
  currentIndex,
  mousePosition,
  viewCount,
  mainSize,
  mainTop,
  currentListHeight,
} from "./atoms";
import { getAction } from "connected-react-router";

export const indicatorIndex = selector({
  key: "indicatorIndex",
  get: ({ get }) => {
    const mp = get(mousePosition);
    const mt = get(mainTop);
    const ms = get(mainSize);
    const vc = get(viewCount);
    return Math.min(vc, parseInt(((mp[1] - mt) / (ms[1] - 16)) * (vc - 1)));
  },
});

export const currentIndexIndicatorTop = selector({
  key: "currentIndexIndicatorTop",
  get: ({ get }) => {
    const cip = get(currentIndexPercentage);
    const [unused, mh] = get(mainSize);
    return Math.min(mh - 3, Math.max(32, cip * (mh - 32) + 32));
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
    const [unused, mh] = get(mainSize);
    const cip = get(currentIndexPercentage);
    return Math.max(0, clh - mh) * cip;
  },
});
