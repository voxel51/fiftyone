import { selector, selectorFamily } from "recoil";

import { getPage, getSocket } from "../utils/socket";
import {
  mousePosition,
  viewCount,
  mainSize,
  currentListTop,
  itemsPerRequest,
  segmentIsLoaded,
  gridMargin,
  portNumber,
  liveTop,
  previousLayout,
  itemRowCache,
  destinationTop,
  previousSegmentsToRender,
} from "./atoms";

export const itemBaseSize = selector({
  key: "itemBaseSize",
  get: ({ get }) => {
    const [viewPortWidth, unused] = get(mainSize);
    const cols = get(baseNumCols(viewPortWidth));
    const margin = get(gridMargin);
    const workingWidth = viewPortWidth - (cols + 1) * margin;
    return {
      width: workingWidth / cols,
      height: workingWidth / cols,
    };
  },
});

export const currentListHeight = selector({
  key: "currentListHeight",
  get: ({ get }) => {
    const { height } = get(itemBaseSize);
    const [viewPortWidth, unused] = get(mainSize);
    const margin = get(gridMargin);
    const count = get(viewCount);
    const cols = get(baseNumCols(viewPortWidth));
    return Math.ceil(count / cols) * (height + margin) + margin;
  },
});

export const indicatorIndex = selector({
  key: "indicatorIndex",
  get: ({ get }) => {
    const [unused, mpt] = get(mousePosition);
    const ms = get(mainSize);
    const vc = get(viewCount);
    const numerator = Math.max(mpt, 0);
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

export const currentSegment = selector({
  key: "currentSegment",
  get: ({ get }) => {
    const ci = get(currentIndex);
    return get(segmentIndexFromItemIndex(ci));
  },
});

export const topFromIndex = selectorFamily({
  key: "topFromIndex",
  get: (proposed) => ({ get }) => {
    const cache = get(itemRowCache(proposed));
    const index = cache ? cache[0] : proposed;
    const [viewPortWidth, unused] = get(mainSize);
    const cols = get(baseNumCols(viewPortWidth));
    const { height } = get(baseItemSize(viewPortWidth));
    const margin = get(gridMargin);
    return Math.max(0, Math.floor(index / cols) - 1) * (height + margin);
  },
});

export const indexFromTop = selectorFamily({
  key: "indexFromTop",
  get: ({ top, viewPortWidth }) => ({ get }) => {
    const cols = get(baseNumCols(viewPortWidth));
    const { height } = get(baseItemSize(viewPortWidth));
    const margin = get(gridMargin);
    return Math.floor(top / (height + margin)) * cols;
  },
});

export const displacementFromTop = selectorFamily({
  key: "displacementFromTop",
  get: ({ top, viewPortWidth }) => ({ get }) => {
    const { height } = get(baseItemSize(viewPortWidth));
    const margin = get(gridMargin);
    return (top % (height + margin)) / (height + margin);
  },
});

export const currentIndex = selector({
  key: "currentIndex",
  get: ({ get }) => {
    const prevLayout = get(previousLayout);
    if (!!!prevLayout || prevLayout.data.length === 0) return 0;
    const { data } = prevLayout;
    const top = get(liveTop);
    const [viewPortWidth, unused] = get(mainSize);
    const margin = get(gridMargin);
    let outOfBounds = data[data.length - 1][0].top - margin < top;
    outOfBounds = outOfBounds || data[0][0].top - margin > top;
    if (outOfBounds) {
      const proposed = get(indexFromTop({ top, viewPortWidth }));
      const cache = get(itemRowCache(proposed));
      if (cache) return cache[0];
      return proposed;
    }
    let start, stop;
    for (let i = 0; i < data.length; i++) {
      const { top: itemTop, height, index } = data[i][0];
      start = itemTop - margin;
      stop = itemTop + height;
      if (start <= top && stop >= top) {
        return Math.max(index, 0);
      }
    }
  },
  set: ({ set, get }, index) => {
    const top = get(topFromIndex(index));
    const height = get(currentListHeight) - get(mainSize)[1];
    set(destinationTop, Math.min(top, height));
  },
});

export const currentDisplacement = selector({
  key: "currentDisplacement",
  get: ({ get }) => {
    const prevLayout = get(previousLayout);
    if (!!!prevLayout || prevLayout.data.length === 0) return 0;
    const { data } = prevLayout;
    const top = get(liveTop);
    const [viewPortWidth, unused] = get(mainSize);
    const margin = get(gridMargin);
    let outOfBounds = data[data.length - 1][0].top - margin < top;
    outOfBounds = outOfBounds || data[0][0].top - margin > top;
    if (outOfBounds) {
      return get(displacementFromTop({ top, viewPortWidth }));
    }
    let start, stop;
    for (let i = 0; i < data.length; i++) {
      const { top: itemTop, height } = data[i][0];
      start = itemTop - margin;
      stop = itemTop + height;
      if (start <= top && stop >= top) {
        return (top - start) / (height + margin);
      }
    }
  },
});

export const currentIndexPercentage = selector({
  key: "currentIndexPercentage",
  get: ({ get }) => {
    const index = get(currentIndex);
    const displacement = get(currentDisplacement);
    const count = get(viewCount);
    return count ? (index + displacement) / count : 0;
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
    const breakpoints = [...Array(6).keys()].map((i) => Math.pow(10, i + 2));
    for (let i = 0; i < breakpoints.length; i++) {
      const breakpoint = breakpoints[i];
      numTicks = Math.ceil(vc / Math.pow(10, i + 1));
      tickSize = Math.pow(10, i + 1);
      if (vc <= breakpoint) break;
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

export const pageParams = selector({
  key: "pageParams",
  get: ({ get }) => {
    return {
      length: get(itemsPerRequest),
    };
  },
});

export const segmentData = selectorFamily({
  key: "segmentData",
  get: (segmentIndex) => async ({ get }) => {
    const params = get(pageParams);
    return await getPage(getSocket(5151, "state"), {
      ...params,
      page: segmentIndex,
    });
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
    const segmentIndex = get(segmentIndexFromItemIndex(itemIndex));
    const loaded = get(segmentIsLoaded(segmentIndex));
    if (loaded) {
      const data = get(itemData(itemIndex));
      const port = get(portNumber);
      return `http://127.0.0.1:${port}/?path=${data.sample.filepath}`;
    } else {
      return null;
    }
  },
});

export const baseItemSize = selectorFamily({
  key: "baseItemSize",
  get: (viewPortWidth) => ({ get }) => {
    const cols = get(baseNumCols(viewPortWidth));
    const gm = get(gridMargin);
    const size = (viewPortWidth - (cols + 1) * gm) / cols;
    return {
      width: size,
      height: size,
    };
  },
});

export const baseItemData = selector({
  key: "baseItemData",
  get: ({ get }) => {
    return {
      aspectRatio: 1,
    };
  },
});

export const listHeight = selectorFamily({
  key: "listHeight",
  get: (viewPortWidth) => ({ get }) => {
    const count = get(viewCount);
    const cols = get(baseNumCols(viewPortWidth));
    const margin = get(gridMargin);
    const { height } = get(baseItemSize(viewPortWidth));
    return Math.ceil(count / cols) * height * margin + margin;
  },
});

export const baseNumCols = selectorFamily({
  key: "baseNumCols",
  get: (viewPortWidth) => ({ get }) => {
    if (viewPortWidth <= 600) {
      return 2;
    } else if (viewPortWidth < 768) {
      return 3;
    } else if (viewPortWidth < 992) {
      return 4;
    } else if (viewPortWidth < 1200) {
      return 5;
    } else {
      return 7;
    }
  },
});

export const tilingThreshold = selectorFamily({
  key: "tilingThreshold",
  get: (viewPortWidth) => ({ get }) => {
    return get(baseNumCols(viewPortWidth));
  },
});

export const itemRow = selectorFamily({
  key: "itemRow",
  get: ({ startIndex, endIndex, viewPortWidth }) => ({ get }) => {
    const count = get(viewCount);
    const threshold = get(tilingThreshold(viewPortWidth));
    let index = startIndex;
    let aspectRatio = 0;
    let data = [];
    let item;
    while (index >= 0 && index < count && aspectRatio < threshold) {
      if (endIndex !== null && index > endIndex) break;
      item = get(itemIsLoaded(index))
        ? get(itemData(index))
        : get(baseItemData);
      aspectRatio += item.aspectRatio;
      data.push({ ...item, index });
      index += 1;
    }

    return {
      data,
      aspectRatio,
    };
  },
});

export const itemRowReverse = selectorFamily({
  key: "itemRow",
  get: ({ startIndex, endIndex, viewPortWidth }) => ({ get }) => {
    const count = get(viewCount);
    const threshold = get(tilingThreshold(viewPortWidth));
    const getItem = (idx) =>
      get(itemIsLoaded(idx)) ? get(itemData(idx)) : get(baseItemData);
    let index = startIndex;
    let aspectRatio = 0;
    let data = [];
    let item;
    const reducer = (acc, val) => (acc += val.aspectRatio);
    while (index >= 0 && index < count) {
      item = getItem(index);
      aspectRatio += item.aspectRatio;
      data.unshift({ ...item, index });
      index -= 1;
      if (aspectRatio >= threshold && index > 0 && !endIndex) {
        const prev = get(itemData(index));
        const check = [prev, ...data.slice(0, data.length - 1)];
        const checkAspectRatio = check.reduce(reducer, 0);
        if (checkAspectRatio < threshold) {
          data.unshift(prev);
          index -= 1;
          aspectRatio += prev.aspectRatio;
        }
        break;
      }
      if (endIndex !== null && index < endIndex) break;
    }

    return {
      data,
      aspectRatio,
    };
  },
});

export const currentLayout = selector({
  key: "currentLayout",
  get: ({ get }) => {
    let start = get(currentIndex);
    const top = get(liveTop);
    const displacement = get(currentDisplacement);
    const [viewPortWidth, viewPortHeight] = get(mainSize);
    const count = get(viewCount);
    const margin = get(gridMargin);
    let index = start;
    let height;
    let width;
    let row;
    let workingWidth;
    let currentLeft;
    let currentTop = top;
    let data = [];
    let rowData = [];
    let item;

    let pixelDisplacement;
    let resultStart = index;
    let resultEnd = index;
    let rowItems;
    let cache;
    let startIndex;
    let endIndex;
    const mapping = {};

    let layoutHeightForward = 0;
    while (layoutHeightForward < viewPortHeight * 1.5 && index < count) {
      cache = get(itemRowCache(index));
      if (cache) {
        startIndex = cache[0];
        endIndex = cache[cache.length - 1];
        index = startIndex;
      } else {
        startIndex = index;
        endIndex = null;
      }
      row = get(itemRow({ startIndex, endIndex, viewPortWidth }));
      workingWidth = viewPortWidth - (row.data.length + 1) * margin;
      height = workingWidth / row.aspectRatio;
      if (index === start) {
        currentTop -= (height + margin) * displacement;
        layoutHeightForward -= (height + margin) * displacement;
        pixelDisplacement = (height + margin) * displacement;
      }
      rowData = [];
      currentTop += margin;
      currentLeft = 0;
      for (let i = 0; i < row.data.length; i++) {
        item = row.data[i];
        currentLeft += margin;
        width = (item.aspectRatio / row.aspectRatio) * workingWidth;
        rowData.push({
          width,
          height,
          top: currentTop,
          left: currentLeft,
          index: item.index,
        });
        currentLeft += width;
      }
      currentTop += height;
      layoutHeightForward += margin + height;
      index += rowData.length;
      rowItems = row.data.map((i) => i.index);
      for (let i = 0; i < row.data.length; i++) {
        mapping[row.data[i].index] = rowItems;
      }
      data.push(rowData);
      resultEnd = Math.min(index, count);
    }

    index = start - 1;
    currentTop = top - pixelDisplacement;
    let layoutHeightBackward = 0;
    while (layoutHeightBackward < viewPortHeight * 0.5 && index >= 0) {
      cache = get(itemRowCache(index));
      if (cache) {
        startIndex = cache[cache.length - 1];
        endIndex = cache[0];
        index = startIndex;
      } else {
        startIndex = index;
        endIndex = null;
      }
      row = get(itemRowReverse({ startIndex, endIndex, viewPortWidth }));
      workingWidth = viewPortWidth - (row.data.length + 1) * margin;
      height = workingWidth / row.aspectRatio;
      currentTop -= height;
      rowData = [];
      currentLeft = margin;
      for (let i = 0; i < row.data.length; i++) {
        item = row.data[i];
        width = (item.aspectRatio / row.aspectRatio) * workingWidth;
        rowData.push({
          width,
          height,
          top: currentTop,
          left: currentLeft,
          index: item.index,
        });
        currentLeft += margin + width;
      }
      currentTop -= margin;
      layoutHeightBackward += margin + height;
      index -= rowData.length;
      rowItems = row.data.map((i) => i.index);
      for (let i = 0; i < row.data.length; i++) {
        mapping[row.data[i].index] = rowItems;
      }
      data.unshift(rowData);
      resultStart = Math.max(index + 1, 0);
    }

    return {
      data,
      mapping,
      range: [resultStart, resultEnd],
    };
  },
});

export const currentItems = selector({
  key: "currentItems",
  get: ({ get }) => {
    const { data, range } = get(currentLayout);
    console.log(range, data);
    return [...Array(range[1] - range[0]).keys()].map((i) => i + range[0]);
  },
});

export const itemsToRender = selector({
  key: "itemsToRender",
  get: ({ get }) => {
    const { data } = get(currentLayout);
    const result = {};
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (let j = 0; j < row.length; j++) {
        result[row[j].index] = row[j];
      }
    }
    return result;
  },
});

export const segmentsToRender = selector({
  key: "segmentsToRender",
  get: ({ get }) => {
    const { range } = get(currentLayout);
    const start = get(segmentIndexFromItemIndex(range[0]));
    const end = get(segmentIndexFromItemIndex(range[1])) + 1;
    const total = get(numSegments);
    return [...Array(Math.min(total, end) - start).keys()].map(
      (i) => i + start
    );
  },
});

export const segmentHeight = selector({
  key: "segmentHeight",
  get: (segmentIndex) => ({ get }) => {
    const segmentItems = get(itemsToRenderInSegment(segmentIndex));
    const items = get(itemsToRender);
    const margin = get(gridMargin);
    let currentTop = null;
    let segmentHeight = 0;
    for (let i = 0; i < segmentItems.length; i++) {
      const { top, height } = items[segmentItems[i]];
      if (top === currentTop) continue;
      segmentHeight += height + margin;
    }
    return segmentHeight;
  },
});

export const segmentTop = selectorFamily({
  key: "segmentTop",
  get: (segmentIndex) => ({ get }) => {
    const items = get(itemsToRenderInSegment(segmentIndex));
    const { index } = items[0];
    const { top } = get(itemLayout(index));
    return top;
  },
});

export const itemsToRenderInSegment = selectorFamily({
  key: "itemsToRenderInSegment",
  get: (segmentIndex) => ({ get }) => {
    const items = get(currentItems);
    const batchSize = get(itemsPerRequest);
    let start = batchSize * segmentIndex;
    let end = start + batchSize;
    const result = [];
    let i = items[0] < start ? start - items[0] : 0;
    while (i < items.length && items[i] < end) {
      result.push({
        index: items[i],
        key: items[i] - start,
      });
      i += 1;
    }
    return result;
  },
});

export const itemRowIndices = selectorFamily({
  key: "itemRowIndices",
  get: (index) => ({ get }) => {
    const { mapping } = get(currentLayout);
    return mapping[index];
  },
});

export const itemLayout = selectorFamily({
  key: "itemLayout",
  get: (index) => ({ get }) => {
    const { width, height, top, left } = get(itemsToRender)[index];
    return { width, height, top, left };
  },
});

export const itemAdjustedLayout = selectorFamily({
  key: "itemAdjustedLayout",
  get: (index) => ({ get }) => {
    const segmentIndex = get(segmentIndexFromItemIndex(index));
    const parentTop = get(segmentTop(segmentIndex));
    const { top, left, height, width } = get(itemsToRender)[index];
    return {
      top: top - parentTop,
      left,
      height,
      width,
    };
  },
});
