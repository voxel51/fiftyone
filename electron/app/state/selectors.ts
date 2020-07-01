import { selector, selectorFamily } from "recoil";

import { getPage, getSocket } from "../utils/socket";
import {
  mousePosition,
  viewCount,
  mainSize,
  previousMainSize,
  mainTop,
  currentListTop,
  itemsPerRequest,
  segmentIsLoaded,
  gridMargin,
  portNumber,
  liveTop,
  previousLayout,
} from "./atoms";
import { keyBy } from "lodash";

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

export const currentSegment = selector({
  key: "currentSegment",
  get: ({ get }) => {
    const ci = get(currentIndex);
    return get(segmentIndexFromItemIndex(ci));
  },
});

export const indexFromTop = selectorFamily({
  key: "indexFromTop",
  get: (top, viewPortWidth) => ({ get }) => {
    const cols = baseNumCols(viewPortWidth);
    const { height } = baseItemSize(viewPortWidth);
    const margin = get(gridMargin);
    return Math.floor(top / (height + margin)) * cols;
  },
});

export const displacementFromTop = selectorFamily({
  key: "displacementFromTop",
  get: (top, viewPortWidth) => ({ get }) => {
    const { height } = baseItemSize(viewPortWidth);
    const margin = get(gridMargin);
    return (top % (height + margin)) / (height + margin);
  },
});

export const currentIndex = selector({
  key: "currentIndex",
  get: ({ get }) => {
    const prevLayout = get(previousLayout);
    if (!!!prevLayout) return 0;
    const top = get(liveTop);
    const [viewPortWidth, unused] = get(mainSize);
    const margin = get(gridMargin);
    let outOfBounds = prevLayout[prevLayout.length - 1][0] < top;
    outOfBounds = outOfBounds && prevLayout[0][0] > top;
    if (outOfBounds) {
      return get(indexFromTop(top, viewPortWidth));
    }
    let start, stop;
    for (let i = 0; i < prevLayout.length; i++) {
      const { top: itemTop, height, index } = prevLayout[i][0];
      start = itemTop;
      stop = itemTop + (height + margin);
      if (start <= top && stop >= top) {
        return index;
      }
    }
  },
});

export const currentDisplacement = selector({
  key: "currentDisplacement",
  get: ({ get }) => {
    const prevLayout = get(previousLayout);
    if (!!!prevLayout) return 0;
    const top = get(liveTop);
    const [viewPortWidth, unused] = get(mainSize);
    const margin = get(gridMargin);
    let outOfBounds = prevLayout[prevLayout.length - 1][0] < top;
    outOfBounds = outOfBounds && prevLayout[0][0] > top;
    if (outOfBounds) {
      return get(displacementFromTop(top, viewPortWidth));
    }
    let start, stop;
    for (let i = 0; i < prevLayout.length; i++) {
      const { top: itemTop, height } = prevLayout[i][0];
      start = itemTop;
      stop = itemTop + (height + margin);
      if (start <= top && stop >= top) {
        return (top - itemTop) / (height + margin);
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
    return (index + displacement) / count;
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
      if (vc < breakpoint) break;
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
    const [viewPortWidth, unused] = get(mainSize);
    return {
      length: get(itemsPerRequest),
      threshold: get(tilingThreshold(viewPortWidth)),
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

export const segmentBaseNumRows = selector({
  key: "segmentBaseNumRows",
  get: ({ get }) => {
    const ipr = get(itemsPerRequest);
    const sbnc = get(segmentBaseNumCols);
    return Math.ceil(ipr / sbnc);
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
  get: (startIndex, viewPortWidth, reverse) => ({ get }) => {
    const count = get(viewCount);
    const threshold = get(tilingThreshold(viewPortWidth));
    let index = startIndex;
    let aspectRatio = 0;
    let data = [];
    let item;
    while (index < count && aspectRatio < threshold) {
      item = get(itemIsLoaded(index))
        ? get(itemData(index))
        : get(baseItemData);
      aspectRatio += item.aspectRatio;
      item = { ...item, index };
      data.push(item);
      index = reverse ? index - 1 : index + 1;
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
    const start = get(currentIndex);
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
    let layoutHeight = 0;
    let pixelDisplacement;
    let resultStart;
    let resultEnd;
    while (layoutHeight < viewPortHeight * 1.5 && index < count) {
      row = get(itemRow(index, viewPortWidth, false));
      workingWidth = viewPortWidth - (row.data.length + 1) * margin;
      height = workingWidth / row.aspectRatio;
      if (index === start) {
        currentTop -= (height + margin) * displacement;
        layoutHeight -= (height + margin) * displacement;
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
      layoutHeight += margin + height;
      index += rowData.length;
      data.push(rowData);
    }

    resultEnd = index;
    index = start - 1;
    currentTop = top - pixelDisplacement;
    while (layoutHeight < viewPortHeight * 2 && index >= 0) {
      row = get(itemRow(index, viewPortWidth, true));
      workingWidth = viewPortWidth - (row.data.length + 1) * margin;
      height = workingWidth / row.aspectRatio;
      currentTop -= height;
      rowData = [];
      currentLeft = viewPortWidth;
      for (let i = 0; i < row.data.length; i++) {
        item = row.data[i];
        width = (item.aspectRatio / row.aspectRatio) * workingWidth;
        currentLeft -= margin + width;
        rowData.push({
          width,
          height,
          top: currentTop,
          left: currentLeft,
          index: item.index,
        });
      }
      currentTop -= margin;
      layoutHeight += margin + height;
      index += rowData.length;
      data.unshift(rowData);
    }
    resultStart = index;
    return {
      data,
      range: [resultStart, resultEnd],
    };
  },
});

export const currentItems = selector({
  key: "currentItems",
  get: ({ get }) => {
    const { range } = get(currentLayout);
    return [...Array(range.length).keys()].map((i) => i + range[0]);
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
    const end = get(segmentIndexFromItemIndex(range[1]));
    return [...Array(end - start).keys()].map((i) => i + start);
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

    while (items[i] && items[i] < end) {
      result.push({
        index: items[i],
        key: items[i] - start,
      });
    }
  },
});

export const itemLayout = selectorFamily({
  key: "itemLayout",
  get: (index) => ({ get }) => {
    const { width, height, top, left } = get(itemsToRender)[index];
    return { width, height, top, left };
  },
});

export const segmentTop = selectorFamily({
  key: "segmentTop",
  get: (segmentIndex) => ({ get }) => {
    return 0;
  },
});
