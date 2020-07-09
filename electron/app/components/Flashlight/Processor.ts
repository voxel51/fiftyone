interface Item {
  aspectRatio: number;
  index?: number;
  sample?: any;
  height?: number;
  width?: number;
  top?: number;
  left?: number;
}

interface Row {
  items: Array<Item>;
  aspectRatio: number;
}

interface ItemRowCache {
  [key: number]: Row;
}

interface SegmentDataCache {
  [key: number]: Array<Item>;
}

interface SegmentItemIndicesCache {
  [key: number]: Array<Number>;
}

interface SegmentLayoutCache {
  [key: number]: any;
}

class Processor {
  baseNumCols: number;
  baseItemSize: number;
  baseItemData: Item;

  containerWidth: number;
  containerHeight: number;
  count: number;
  liveTop: number;
  itemsPerRequest: number;
  margin: number;
  rootIndex: number;
  socket: any;

  private _itemRowCache: ItemRowCache;
  private _segmentDataCache: SegmentDataCache;
  private _segmentItemIndicesCache: SegmentItemIndicesCache;
  private _segmentLayoutCache: SegmentLayoutCache;

  constructor(
    containerSize: [number, number],
    itemsPerRequest: number,
    margin: number,
    socket: any,
    rootIndex: number = 0,
    viewCount: number
  ) {
    this.containerWidth = containerSize[0];
    this.containerHeight = containerSize[1];
    this.itemsPerRequest = itemsPerRequest;
    this.liveTop = 0;
    this.margin = margin;
    this.rootIndex = rootIndex;
    this.socket = socket;
    this.count = viewCount;

    this.baseNumCols = Processor.getBaseNumCols(this.containerWidth);
    this.baseItemSize = Processor.getBaseItemSize(
      this.baseNumCols,
      this.containerWidth,
      this.margin
    );

    this.baseItemData = { aspectRatio: 1 };

    this._itemRowCache = {};
    this._segmentDataCache = {};
    this._segmentItemIndicesCache = {};
    this._segmentLayoutCache = {};
  }

  get currentListHeight() {
    return (
      Math.ceil(this.count / this.baseNumCols) *
        (this.baseItemSize + this.margin) +
      this.margin
    );
  }

  get currentDisplacement() {
    let currentTop = this.getTopFromIndex(this.rootIndex);
    let index = this.rootIndex;
    let segmentIndex;
    let segmentLayout;
    let row;
    while (currentTop < this.liveTop) {
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
  }

  get currentIndex() {
    let currentTop = this.getTopFromIndex(this.rootIndex);
    let index = this.rootIndex;
    let segmentIndex;
    let segmentLayout;
    let row;

    while (currentTop < this.liveTop) {
      segmentIndex = Processor.getSegmentIndexFromItemIndex(index);
      segmentLayout = this._segmentLayoutCache[segmentIndex];

      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = this._itemRowCache[(segmentIndex + 1) * this.itemsPerRequest - 1];
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = this.getItemRow(index).data;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + this.margin;
      }
    }

    return index;
  }

  get currentLayout() {
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
          currentTop += layout.height;
        }
        segmentsComputed += 1;
        itemsComputed += segmentItems.length;
      }
      index += segmentItems.length;
      return top;
    }
  }

  set currentIndex(index): number {
    this.rootIndex = index;
  }

  get tilingThreshold(): number {
    return this.baseNumCols;
  }

  animate() {
    // Main function that sends updates
  }

  getItemData(index: number): Item {
    const data = this._getItemDataFromCache(index);
    switch (data) {
      case "pending":
        return {
          ...this.baseItemData,
          index,
        };
      default:
        return data[index];
    }
  }

  _getItemDataCache(index: number): Item | "pending" {
    const data = this.getSegmentData(
      Processor.getSegmentIndexFromItemIndex(index)
    );
    return data === "pending" ? data : data[index];
  }

  getSegmentData(segmentIndex: number): Array<Item> | "pending" {
    switch (this._segmentDataCache[segmentIndex]) {
      case undefined:
        this._segmentDataCache[segmentIndex] = "pending";
        Processor.getPage(this.socket, segmentIndex).then((data) => {
          this._segmentDataCache[segmentIndex] = data;
          this.animate();
        });
        return "pending";
      case "pending":
        return "pending";
      default:
        return this._segmentDataCache[segmentIndex];
    }
  }

  getItemRow(startIndex: number): Row {
    let index = startIndex;
    let aspectRatio = 0;
    let data = [];
    let item;

    while (index < this.count && aspectRatio < this.tilingThreshold) {
      item = this.getItemData(index);
      aspectRatio += item.aspectRatio;
      data.push(item);
      index += 1;
    }

    const workingWidth = this.containerWidth - (data.length + 1) * this.margin;
    const height = aspectRatio !== 0 ? workingWidth / aspectRatio : 0;

    for (let i = 0; i < data.length; i++) {
      data[i].height = height;
      data[i].width = data[i].aspectRatio * height;
    }

    return {
      items: data,
      aspectRatio,
    };
  }

  getSegmentItemIndices(segmentIndex: number): Array<number> {
    if (segmentIndex in this._segmentItemIndicesStore) {
      return this._segmentItemIndicesStore[segmentIndex];
    }

    const start = segmentIndex * this.itemsPerRequest;
    this._segmentItemIndicesStore[segmentIndex] = [
      ...Array(this.itemsPerRequest).keys(),
    ].map((i) => start + i);

    return this._segmentItemIndicesStore[segmentIndex];
  }

  getTopFromIndex(index: number): number {
    index = index in this._itemRowCache ? this._ItemRowCache[index] : index;
    return (
      Math.max(0, Math.floor(index / this.baseNumCols) - 1) *
      (this.baseItemSize + this.margin)
    );
  }

  static getBaseNumCols(containerWidth: number): number {
    if (containerWidth <= 600) {
      return 2;
    } else if (containerWidth < 768) {
      return 3;
    } else if (containerWidth < 992) {
      return 4;
    } else if (containerWidth < 1200) {
      return 5;
    } else {
      return 7;
    }
  }

  // todo socket type
  static async getPage(socket: any, page: number): Promise<Array<Item>> {
    return new Promise((resolve) => {
      socket.emit("page", page, (data) => resolve(data));
    });
  }

  static getBaseItemSize(
    baseNumCols: number,
    containerWidth: number,
    margin: number
  ): number {
    return (containerWidth - (baseNumCols + 1) * margin) / baseNumCols;
  }

  static getSegmentIndexFromItemIndex(
    itemIndex: number,
    itemsPerRequest: number
  ): number {
    return Math.floor(itemIndex / itemsPerRequest);
  }
}
