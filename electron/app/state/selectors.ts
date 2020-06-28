import { selector, selectorFamily } from "recoil";

import { getPage, getSocket } from "../utils/socket";
import {
  mousePosition,
  viewCount,
  mainSize,
  mainTop,
  currentListTop,
  itemsPerRequest,
  segmentIsLoaded,
  gridMargin,
  portNumber,
} from "./atoms";

export const currentListHeight = selector({
  key: "currentListHeight",
  get: ({ get }) => {
    const { height: ibh } = get(itemBaseSize);
    const gm = get(gridMargin);
    const vc = get(viewCount);
    const sbnc = get(segmentBaseNumCols);
    return Math.ceil(vc / sbnc) * (ibh + gm) + gm;
  },
});

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

export const listHeight = selector({
  key: "listHeight",
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
    const { height: clh } = get(segmentBaseSize(0));
    const [unused, mh] = get(mainSize);
    set(currentListTop, newValue * (clh - mh));
  },
});

export const currentSegment = selector({
  key: "currentSegment",
  get: ({ get }) => {
    const ci = get(currentIndex);
    return get(segmentIndexFromItemIndex(ci));
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
    const clh = get(currentListHeight);
    const [unused, mh] = get(mainSize);
    return [0, clh - mh];
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

export const ticks = selector({
  key: "ticks",
  get: ({ get }) => {
    let numTicks = null;
    let tickSize = null;
    const vc = get(viewCount);
    const breakpoints = [...Array(5).keys()].map((i) => Math.pow(10, i + 3));
    for (let i = breakpoints.length - 1; i > 0; i--) {
      const breakpoint = breakpoints[i];
      numTicks = Math.ceil(vc / Math.pow(10, i + 1));
      tickSize = Math.pow(10, i + 1);
      if (vc > breakpoint) break;
    }
    return [...Array(numTicks).keys()].map((i) => i * tickSize);
  },
});

export const numSegments = selector({
  key: "numSegments",
  get: ({ get }) => {
    const ipr = get(itemsPerRequest);
    const vc = get(viewCount);
    return Math.ceil(vc / ipr);
  },
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
  get: (segmentIndex) => ({ get }) => {
    const params = get(pageParams);
    return getPage(getSocket(5151, "state"), {
      ...params,
      page: segmentIndex,
    });
  },
});

export const itemsToRender = selector({
  key: "itemsToRender",
  get: ({ get }) => {
    return [...Array(50).keys()];
  },
});

export const itemKey = selectorFamily({
  key: "itemKey",
  get: (itemIndex) => ({ get }) => {
    const ipr = get(itemsPerRequest);
    return itemIndex % ipr;
  },
});

export const segmentIndexFromItemIndex = selectorFamily({
  key: "segmentIndexFromItemIndex",
  get: (itemIndex) => ({ get }) => {
    const ipr = get(itemsPerRequest);
    return Math.floor(itemIndex / ipr);
  },
});

export const itemIsLoaded = selectorFamily({
  key: "itemIsLoaded",
  get: (itemIndex) => ({ get }) => {
    const si = get(segmentIndexFromItemIndex(itemIndex));
    return get(segmentIsLoaded(si));
  },
});

export const itemData = selectorFamily({
  key: "itemData",
  get: (itemIndex) => ({ get }) => {
    const ik = get(itemKey(itemIndex));
    const si = get(segmentIndexFromItemIndex(itemIndex));
    return get(segmentData(si))[ik];
  },
});

export const mainAspectRatio = selector({
  key: "mainAspectRatio",
  get: ({ get }) => {
    const [mw, mh] = get(mainSize);
    return mh === 0 ? 0 : mw / mh;
  },
});

export const itemBaseSize = selector({
  key: "itemBaseSize",
  get: ({ get }) => {
    const [mw, mh] = get(mainSize);
    const sbnc = get(segmentBaseNumCols);
    const gm = get(gridMargin);
    const workingWidth = mw - (sbnc + 1) * gm;
    return {
      width: workingWidth / sbnc,
      height: workingWidth / sbnc,
    };
  },
});

export const itemBasePosition = selectorFamily({
  key: "itemBasePosition",
  get: (itemIndex) => ({ get }) => {
    const ik = get(itemKey(itemIndex));
    const ipr = get(itemsPerRequest);
    const sbnc = get(segmentBaseNumCols);
    const si = get(segmentIndexFromItemIndex(itemIndex));
    const lc = si > 0 ? sbnc - ((ipr * si) % sbnc) : 0;
    const row = Math.floor(itemIndex / sbnc) - Math.ceil((si * ipr) / sbnc);
    const col = itemIndex % sbnc;
    const { width: ibw, height: ibh } = get(itemBaseSize);
    const gm = get(gridMargin);

    return {
      top: gm + row * (ibh + gm),
      left: gm + col * (ibw + gm),
    };
  },
});

export const pageParams = selector({
  key: "pageParams",
  get: ({ get }) => {
    return {
      length: get(itemsPerRequest),
      threshold: get(tilingThreshold),
    };
  },
});

export const itemPosition = selectorFamily({
  key: "itemPosition",
  get: (itemIndex) => ({ get }) => {
    const id = get(itemData(itemIndex));
    return {
      top: id.top,
      left: id.left,
    };
  },
});

export const itemSize = selectorFamily({
  key: "itemSize",
  get: (itemIndex) => ({ get }) => {
    const { width, height } = get(itemData(itemIndex));
    return {
      width,
      height,
    };
  },
});

export const itemSource = selectorFamily({
  key: "itemSource",
  get: (itemIndex) => ({ get }) => {
    const id = get(itemData(itemIndex));
    const pn = get(portNumber);
    return `http://127.0.0.1:${pn}/?path=${id.sample.filepath}`;
  },
});

export const segmentHeight = selectorFamily({
  key: "segmentHeight",
  get: (segmentIndex) => ({ get }) => {
    return get(segmentBaseSize(segmentIndex)).height;
  },
});

export const segmentsToRender = selector({
  key: "segmentsToRender",
  get: ({ get }) => {
    const ci = get(currentIndex);
    const cd = 0;
    const [mw, mh] = get(mainSize);
    let h = 0;
    let csi = get(segmentIndexFromItemIndex(ci));
    const ns = get(numSegments);
    const str = [];
    while (h < mh + 600 && csi < ns) {
      h += get(segmentHeight(csi));
      str.push(csi);
      csi += 1;
    }
    return str;
  },
});

export const itemsToRenderInSegment = selectorFamily({
  key: "itemsToRenderInSegment",
  get: (segmentIndex) => ({ get }) => {
    const ipr = get(itemsPerRequest);
    const start = ipr * segmentIndex;

    return [...Array(50).keys()].map((k) => {
      return {
        index: k + start,
        key: k,
      };
    });
  },
});

export const tilingThreshold = selector({
  key: "tilingThreshold",
  get: ({ get }) => {
    return get(segmentBaseNumCols);
  },
});

export const segmentBaseNumCols = selector({
  key: "segmentBaseNumCols",
  get: ({ get }) => {
    const [mw, unused] = get(mainSize);
    if (mw <= 600) {
      return 2;
    } else if (mw < 768) {
      return 3;
    } else if (mw < 992) {
      return 4;
    } else if (mw < 1200) {
      return 6;
    } else {
      return 10;
    }
  },
});

export const segmentBaseNumRows = selector({
  key: "segmentBaseNumRows",
  get: ({ get }) => {
    const ipr = get(itemsPerRequest);
    const sbnc = get(segmentBaseNumCols);
    return Math.ceil(ipr / sbnc);
  },
});

export const segmentBaseSize = selectorFamily({
  key: "segmentBaseSize",
  get: (segmentIndex) => ({ get }) => {
    const { width: ibw, height: ibh } = get(itemBaseSize);
    const ipr = get(itemsPerRequest);
    const sbnc = get(segmentBaseNumCols);
    const lc = (ipr * segmentIndex) % sbnc;
    let ni = ipr - (lc !== sbnc ? lc : 0);
    const nr = Math.ceil(ni / sbnc);
    const gm = get(gridMargin);
    const width = sbnc * ibw + (sbnc + 1) * gm;
    const height = nr * ibh + nr * gm;
    return {
      width,
      height,
    };
  },
});
