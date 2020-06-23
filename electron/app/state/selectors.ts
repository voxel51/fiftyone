import { selector, selectorFamily } from "recoil";

import { getPage, getSocket } from "../utils/socket";
import {
  mousePosition,
  viewCount,
  mainSize,
  mainTop,
  currentListHeight,
  isDraggingIndicator,
  currentListTop,
  itemsPerRequest,
} from "./atoms";

export const indicatorIndex = selector({
  key: "indicatorIndex",
  get: ({ get }) => {
    const [unused, mpt] = get(mousePosition);
    const mt = get(mainTop);
    const ms = get(mainSize);
    const vc = get(viewCount);
    const numerator = Math.max(mpt, 0) - mt;
    const denominator = ms[1] - 16;
    return Math.min(
      Math.max(vc - 1, 0),
      parseInt((numerator / denominator) * (vc - 1))
    );
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
    const clt = get(currentListTop);
    const clh = get(currentListHeight);
    const [unused, mh] = get(mainSize);
    const range = clh - mh;

    if (range <= 0) return 0;
    return clt / range;
  },
  set: ({ get, set }, newValue) => {
    const clh = get(currentListHeight);
    const [unused, mh] = get(mainSize);
    const max = clh - mh;
    const min = 0;
    set(currentListTop, newValue * (clh - mh));
  },
});

export const currentIndex = selector({
  key: "currentIndex",
  get: ({ get }) => {
    const cip = get(currentIndexPercentage);
    const vc = get(viewCount);
    return Math.round(cip * Math.max(0, vc - 1));
  },
  set: ({ get, set }, newValue) => {
    const vc = get(viewCount);
    set(currentIndexPercentage, newValue / (vc - 1));
  },
});

export const currentListTopRange = selector({
  key: "currentListTopRange",
  get: ({ get }) => {
    const [unused, mh] = get(mainSize);
    const clh = get(currentListHeight);
    return [0, clh - mh];
  },
});

export const numTicks = selector({
  key: "numTicks",
  get: ({ get }) => get(viewCount) / 5,
});

export const ticks = selector({
  key: "ticks",
  get: ({ get }) => {
    const ns = get(numTicks);
    return [...Array(ns).keys()].map((i) => 5 * i);
  },
});

export const viewPortWindow = selector({
  key: "viewPortWindow",
  get: ({ get }) => {
    const [unused, mh] = get(mainSize);
    const clt = get(currentListTop);
    return [clt, clt + mh];
  },
});

export const numSections = selector({
  key: "numSections",
  get: ({ get }) => {
    const vc = get(viewCount);
    const breakpoints = [...Array(5).keys()].map((i) => Math.pow(10, i + 3));
    for (const i = 0; i < breakpoints.length; i++) {
      const breakpoint = breakpoints[i];
      if (vc <= breakpoint) return Math.ceil(vc / Math.pow(10, i + 1));
    }
    return Math.ceil(vc / Math.pow(10, breakpoints.length));
  },
});

export const visibleSections = selectorFamily({
  key: "sectionsToRender",
  get: ({ get }) => {},
});

export const sectionSegmentIndices = selectorFamily({
  key: "sectionSegmentIndices",
  get: (sectionIndex) => ({ get }) => {},
});

export const segmentItemIndices = selectorFamily({
  key: "segmentItemIndices",
  get: (segmentIndex) => ({ get }) => {
    const ipr = get(itemsPerRequest);
    const start = segmentIndex * ipr;
    return [...Array(ipr).keys()].map((i) => start + i);
  },
});

export const segmentData = selectorFamily({
  key: "segmentData",
  get: (segmentIndex) => async ({ get }) => {
    return await getPage(getSocket(5151, "state"), segmentIndex);
  },
});
