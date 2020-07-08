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
  itemRowCache,
  destinationTop,
  rootIndex,
  baseLayout,
  segmentLayoutCache,
  baseItemLayout,
  firstBase,
  secondBase,
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
    const top = get(liveTop);
    const root = get(rootIndex);
    const rootTop = get(topFromIndex(root));
    const numItemsInSegment = get(itemsPerRequest);
    const margin = get(gridMargin);
    const [viewPortWidth, unused] = get(mainSize);
    let currentTop = rootTop;
    let index = root;
    let segmentIndex;
    let segmentLayout;
    let row;
    while (currentTop < top) {
      segmentIndex = get(segmentIndexFromItemIndex(index));
      segmentLayout = get(segmentLayoutCache(segmentIndex));
      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = get(itemRowCache((segmentIndex + 1) * numItemsInSegment - 1));
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = get(itemRow({ startIndex: index, viewPortWidth })).data;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + margin;
      }
    }
    return index;
  },
  set: ({ set }, index) => {
    set(rootIndex, index);
  },
});

export const currentDisplacement = selector({
  key: "currentDisplacement",
  get: ({ get }) => {
    const top = get(liveTop);
    const root = get(rootIndex);
    const rootTop = get(topFromIndex(root));
    const numItemsInSegment = get(itemsPerRequest);
    const margin = get(gridMargin);
    const [viewPortWidth, unused] = get(mainSize);
    let currentTop = rootTop;
    let index = root;
    let segmentIndex;
    let segmentLayout;
    let row;
    while (currentTop < top) {
      segmentIndex = get(segmentIndexFromItemIndex(index));
      segmentLayout = get(segmentLayoutCache(segmentIndex));
      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = get(itemRowCache((segmentIndex + 1) * numItemsInSegment - 1));
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = get(itemRow({ startIndex: index, viewPortWidth })).data;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + margin;
      }
    }
    row = get(itemRow({ startIndex: index, viewPortWidth })).data;
    if (row.length === 0) return 0;

    return (currentTop - top) / (row[0].height + margin);
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
  get: () => ({ aspectRatio: 1 }),
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
    const margin = get(gridMargin);
    let index = startIndex;
    let aspectRatio = 0;
    let data = [];
    let item;
    while (index < count && aspectRatio < threshold) {
      if (endIndex !== null && index > endIndex) break;
      item = get(itemIsLoaded(index))
        ? get(itemData(index))
        : get(baseItemData);
      aspectRatio += item.aspectRatio;
      data.push({ ...item, index });
      index += 1;
    }

    const workingWidth = viewPortWidth - (data.length + 1) * margin;
    const height = aspectRatio !== 0 ? workingWidth / aspectRatio : 0;

    return {
      data: data.map((item) => ({
        ...item,
        height,
        width: item.aspectRatio * height,
      })),
      aspectRatio,
    };
  },
});

export const isSegmentStart = selectorFamily({
  key: "isSegmentStart",
  get: (index) => ({ get }) => {
    const segmentLength = get(itemsPerRequest);
    const count = get(viewCount);
    if (index % segmentLength === 0) return true;
    return false;
  },
});

export const segmentsToRender = selector({
  key: "segmentsToRender",
  get: ({ get }) => {
    const index = get(currentIndex);
    return [0, 1];
  },
});

export const itemsToRender = selector({
  key: "itemsToRender",
  get: ({ get }) => {
    const segments = get(segmentsToRender);
    let items = [];
    for (let i = 0; i < segments.length; i++) {
      items = [...items, ...get(segmentItemIndices(segments[i]))];
    }
    return items;
  },
});

export const currentLayout = selector({
  key: "currentLayout",
  get: ({ get }) => {
    const [viewPortWidth, unused] = get(mainSize);
    if (viewPortWidth === 0) return;
    const items = get(itemsToRender);
    const segments = get(segmentsToRender);
    const first = get(firstBase);
    const second = get(secondBase);
    const margin = get(gridMargin);
    const baseSize = get(baseItemSize(viewPortWidth));
    const mapping = {};
    if (first.index === null) {
      first.index = 0;
    }

    if (second.index === null) {
      second.index = 1;
    }
    mapping[0] = first;
    mapping[1] = second;

    const top = get(liveTop);
    const root = get(rootIndex);
    const rootTop = get(topFromIndex(root));
    let currentTop = rootTop;
    let index = root;
    let segmentIndex;
    let segmentItems;
    let row;
    let rowStart;
    let rowEnd;

    let itemsComputed = 0;
    let segmentsComputed = 0;
    while (segmentsComputed < 2 && itemsComputed < items.length) {
      segmentIndex = get(segmentIndexFromItemIndex(index));
      segmentItems = get(segmentItemIndices(segmentIndex));
      if (segmentIndex in mapping) {
        const cache = get(segmentLayoutCache(segmentIndex));
        const base = mapping[segmentIndex] === first ? first : second;
        if (cache !== null) {
          base.items = cache.items;
          base.y = cache.y;
          base.height = cache.height;
          base.index = segmentIndex;
          index += segmentItems.length;
          currentTop += cache.height;
        } else {
          if (!rowStart) rowStart = index;
          let layout = {
            index: segmentIndex,
            startIndex: rowStart,
            endIndex: null,
            y: currentTop,
            height: 0,
            items: [],
          };
          let start = rowStart;
          let y = margin;
          while (
            rowEnd !== null ||
            rowEnd < segmentItems[segmentItems.length - 1]
          ) {
            row = get(itemRow({ startIndex: start, viewPortWidth })).data;
            let x = margin;
            for (let i = 0; i < row.length; i++) {
              if (segmentItems.indexOf(row[i].index) >= 0) {
                layout.items.push({
                  index: row[i].index,
                  x: x,
                  y: y,
                  scaleX: row[i].width / baseSize.width,
                  scaleY: row[i].height / baseSize.height,
                });
                x += row[i].width + margin;
              }
              rowEnd = row[row.length - 1].index;
              start = rowEnd + 1;
            }
            y += row[0].height + margin;
            layout.height = y;
            if (rowEnd >= segmentItems[segmentItems.length - 1]) break;
          }
          layout.endIndex = rowEnd;
          mapping[segmentIndex].startIndex = layout.startIndex;
          mapping[segmentIndex].endIndex = layout.endIndex;
          mapping[segmentIndex].y = layout.y;
          mapping[segmentIndex].index = layout.index;
          mapping[segmentIndex].height = layout.height;
          mapping[segmentIndex].items = layout.items;
          currentTop += layout.height;
        }
        segmentsComputed += 1;
        itemsComputed += segmentItems.length;
      }
      index += segmentItems.length;
    }
  },
});
