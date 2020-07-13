/**
 *
 * @c
 */

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

interface Offset {
  index: number;
  displacement: number;
}

interface SegmentLayout {
  rows: Array<Row>;
  top: number;
  height: number;
}

enum ScrollDirection {
  Up = "UP",
  Down = "DOWN",
}

enum Base {
  First = "FIRST",
  Second = "SECOND",
}

type Bases = {
  [key in Base]: SegmentLayout;
};

function isPositiveInteger(value: number): boolean {
  return value > 0 && Number.isInteger(value);
}

class ProcessorError extends Error {
  readonly name: string = "ProcessorError";

  constructor(message) {
    super(message);
  }
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
  private socket: any;
  private scrollDirection: ScrollDirection = ScrollDirection.Down;
  private bases: Bases;

  private itemRowCache: ItemRowCache = {};
  private segmentDataCache: SegmentDataCache = {};
  private segmentItemIndicesCache: SegmentItemIndicesCache = {};
  private segmentLayoutCache: SegmentLayoutCache = {};

  /**
   *
   * @param containerSize
   * @param itemsPerRequest
   * @param margin
   * @param socket
   * @param rootIndex
   * @param count
   */
  constructor(
    containerSize: [number, number],
    private itemsPerRequest: number,
    private margin: number,
    private socket: any,
    private rootIndex: number = 0,
    count: number
  ) {
    this.containerWidth = containerSize[0];
    this.containerHeight = containerSize[1];
    this.itemsPerRequest = itemsPerRequest;
    this.liveTop = 0;
    this.margin = margin;
    this.rootIndex = rootIndex;
    this.socket = socket;
    this.count = count;
    this.validate();

    this.baseNumCols = Processor.getBaseNumCols(this.containerWidth);
    this.baseItemSize = Processor.getBaseItemSize(
      this.baseNumCols,
      this.containerWidth,
      this.margin
    );

    this.bases;
  }

  private validate(): void {
    if (!isPositiveInteger(this.count)) {
      throw new ProcessorError("count must be greater than zero");
    }

    if (!isPositiveInteger(this.containerWidth)) {
      throw new ProcessorError("containerWidth must be greater than zero");
    }

    if (!isPositiveInteger(this.containerHeight)) {
      throw new ProcessorError("containerHeight must be greater than zero");
    }

    if (!isPositiveInteger(this.containerWidth)) {
      throw new ProcessorError("itemsPerRequest must be greater than zero");
    }

    if (this.margin < 0) {
      throw new ProcessorError("margin must be non-negative");
    }
  }

  /**
   * @remarks
   * This is
   */
  currentListHeight(): number {
    return (
      Math.ceil(this.count / this.baseNumCols) *
        (this.baseItemSize + this.margin) +
      this.margin
    );
  }

  /**
   *
   */
  computeCurrentOffset(): Offset {
    let currentTop = this.getTopFromIndex(this.rootIndex);
    let index = this.rootIndex;
    let displacement;
    let segmentIndex;
    let segmentLayout;
    let row;

    while (currentTop < this.liveTop) {
      segmentIndex = Processor.getSegmentIndexFromItemIndex(
        index,
        this.itemsPerRequest
      );
      segmentLayout = this.segmentLayoutCache[segmentIndex];

      if (segmentLayout && segmentLayout.top + segmentLayout.height > top) {
        row = this.itemRowCache[(segmentIndex + 1) * this.itemsPerRequest - 1];
        index = row[row.length - 1] + 1;
        currentTop = segmentLayout.top + segmentLayout.height;
      } else {
        row = this.getItemRow(index).items;
        index = row[row.length - 1].index + 1;
        currentTop += row[0].height + this.margin;
      }
    }
    row = this.getItemRow(index).items;
    displacement =
      row.length === 0
        ? (displacement = 0)
        : (currentTop - this.liveTop) / (row[0].height + this.margin);

    return {
      index,
      displacement,
    };
  }

  /**
   * Returns the tiling threshold, currently the only hyperparameter of the algorithm.
   *
   * @remarks
   * When a row meets this aspect ratio, we consider the row built. This is equivalent to the base number columns where items have a 1:1 aspect ratio
   *
   * @returns the aspect ratio threshold for row building
   */
  get tilingThreshold(): number {
    return this.baseNumCols;
  }

  /**
   *
   */
  animate(): void {}

  /**
   *
   * @param index
   */
  getItemData(index: number): Item {
    const data = this.getItemDataFromCache(index);
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

  /**
   *
   * @param index
   */
  getItemDataFromCache(index: number): Item | "pending" {
    const data = this.getSegmentData(
      Processor.getSegmentIndexFromItemIndex(index, this.itemsPerRequest)
    );
    return data === "pending" ? data : data[index];
  }
  /**
   *
   * @param segmentIndex
   */
  getSegmentData(segmentIndex: number): Array<Item> | "pending" {
    switch (this.segmentDataCache[segmentIndex]) {
      case undefined:
        this.segmentDataCache[segmentIndex] = "pending";
        Processor.getPage(this.socket, segmentIndex).then((data) => {
          this.segmentDataCache[segmentIndex] = data;
          this.animate();
        });
        return "pending";
      case "pending":
        return "pending";
      default:
        return this.segmentDataCache[segmentIndex];
    }
  }

  /**
   *
   * @param startIndex
   */
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

  /**
   *
   * @param segmentIndex
   */
  getSegmentItemIndices(segmentIndex: number): Array<number> {
    if (segmentIndex in this.segmentItemIndicesCache) {
      return this.segmentItemIndicesCache[segmentIndex];
    }

    const start = segmentIndex * this.itemsPerRequest;
    this.segmentItemIndicesCache[segmentIndex] = [
      ...Array(Math.min(this.itemsPerRequest, this.count - start)).keys(),
    ].map((i) => start + i);

    return this.segmentItemIndicesCache[segmentIndex];
  }

  /**
   *
   * @param index
   */
  getTopFromIndex(index: number): number {
    index =
      index in this.itemRowCache
        ? this.itemRowCache[index].items[0].index
        : index;
    return (
      Math.max(0, Math.floor(index / this.baseNumCols) - 1) *
      (this.baseItemSize + this.margin)
    );
  }

  /**
   *
   * @param containerWidth
   */
  private static getBaseNumCols(containerWidth: number): number {
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

  /**
   *
   * @param socket
   * @param page
   */
  private static async getPage(
    socket: any,
    page: number
  ): Promise<Array<Item>> {
    return new Promise((resolve) => {
      socket.emit("page", page, (data) => resolve(data));
    });
  }

  /**
   *
   * @param baseNumCols
   * @param containerWidth
   * @param margin
   */
  private static getBaseItemSize(
    baseNumCols: number,
    containerWidth: number,
    margin: number
  ): number {
    return (containerWidth - (baseNumCols + 1) * margin) / baseNumCols;
  }
  /**
   *
   * @param itemIndex
   * @param itemsPerRequest
   */
  private static getSegmentIndexFromItemIndex(
    itemIndex: number,
    itemsPerRequest: number
  ): number {
    return Math.floor(itemIndex / itemsPerRequest);
  }

  /**
   *
   * @param count
   * @param itemsPerRequest
   */
  private static getNumSegments(
    count: number,
    itemsPerRequest: number
  ): number {
    return Math.ceil(count / itemsPerRequest);
  }
}
