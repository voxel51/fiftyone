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
  [key: number]: Array<Item> | "pending";
}

interface SegmentItemIndicesCache {
  [key: number]: Array<number>;
}

interface SegmentLayoutCache {
  [key: number]: any;
}

class Processor {
  baseNumCols: number;
  baseItemSize: number;
  baseItemData: Item = { aspectRatio: 1 };

  containerWidth: number;
  containerHeight: number;
  count: number;
  liveTop: number;
  itemsPerRequest: number;
  margin: number;
  rootIndex: number;
  socket: any;

  private _itemRowCache: ItemRowCache = {};
  private _segmentDataCache: SegmentDataCache = {};
  private _segmentItemIndicesCache: SegmentItemIndicesCache = {};
  private _segmentLayoutCache: SegmentLayoutCache = {};

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
  }

  get currentListHeight(): number {
    return (
      Math.ceil(this.count / this.baseNumCols) *
        (this.baseItemSize + this.margin) +
      this.margin
    );
  }

  get currentDisplacement(): number {
    let currentTop = this.getTopFromIndex(this.rootIndex);
    let index = this.rootIndex;
    let segmentIndex;
    let segmentLayout;
    let row;
    while (currentTop < this.liveTop) {
      segmentIndex = Processor.getSegmentIndexFromItemIndex(
        index,
        this.itemsPerRequest
      );
      segmentLayout = this._segmentLayoutCache[segmentIndex];

      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = this._itemRowCache[(segmentIndex + 1) * this.itemsPerRequest - 1];
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = this.getItemRow(index).items;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + this.margin;
      }
    }
    row = this.getItemRow(index).items;
    if (row.length === 0) return 0;

    return (currentTop - this.liveTop) / (row[0].height + this.margin);
  }

  get currentIndex(): number {
    let currentTop = this.getTopFromIndex(this.rootIndex);
    let index = this.rootIndex;
    let segmentIndex;
    let segmentLayout;
    let row;

    while (currentTop < this.liveTop) {
      segmentIndex = Processor.getSegmentIndexFromItemIndex(
        index,
        this.itemsPerRequest
      );
      segmentLayout = this._segmentLayoutCache[segmentIndex];

      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = this._itemRowCache[(segmentIndex + 1) * this.itemsPerRequest - 1];
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = this.getItemRow(index).items;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + this.margin;
      }
    }

    return index;
  }

  set currentIndex(index: number) {
    this.rootIndex = index;
  }

  get tilingThreshold(): number {
    return this.baseNumCols;
  }

  animate(): void {
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

  _getItemDataFromCache(index: number): Item | "pending" {
    const data = this.getSegmentData(
      Processor.getSegmentIndexFromItemIndex(index, this.itemsPerRequest)
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
    if (segmentIndex in this._segmentItemIndicesCache) {
      return this._segmentItemIndicesCache[segmentIndex];
    }

    const start = segmentIndex * this.itemsPerRequest;
    this._segmentItemIndicesCache[segmentIndex] = [
      ...Array(this.itemsPerRequest).keys(),
    ].map((i) => start + i);

    return this._segmentItemIndicesCache[segmentIndex];
  }

  getTopFromIndex(index: number): number {
    index =
      index in this._itemRowCache
        ? this._itemRowCache[index].items[0].index
        : index;
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
