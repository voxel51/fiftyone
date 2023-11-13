import { BufferRange, Buffers } from "../../../state";

/**
 * Manages buffer ranges for ImaVid.
 * Ranges are assumed to be inclusive, i.e. [start, end]
 */
export class BufferManager {
  public buffers: Buffers;
  private bufferMetadata: {
    [rangeIndex: number]: string;
  };

  constructor(buffers: Buffers = []) {
    this.buffers = buffers;
    this.bufferMetadata = {};
  }

  /**
   * Returns the total number of frames in the buffer.
   */
  get totalFramesInBuffer() {
    return this.buffers.reduce(
      (total, range) => total + range[1] - range[0] + 1,
      0
    );
  }

  /**
   * Adds metadata to a buffer range at the specified index.
   */
  public addMetadataToBufferRange(rangeIndex: number, metadata: string) {
    this.bufferMetadata[rangeIndex] = metadata;
  }

  /**
   * Removes metadata from a buffer range at the specified index.
   */
  public removeMetadataFromBufferRange(rangeIndex: number) {
    delete this.bufferMetadata[rangeIndex];
  }

  /**
   * Returns the metadata for a buffer range at the specified index.
   */
  public getMetadataForBufferRange(rangeIndex: number) {
    return this.bufferMetadata[rangeIndex];
  }

  /**
   * Adds a buffer range to the buffer.
   * If the new range overlaps with an existing range, the two ranges are merged.
   * Time complexity: O(nlogn)
   */
  public addNewRange(
    range: Readonly<BufferRange>,
    ignoreRangesWithMetadata = true
  ): void {
    if (range[0] === range[1]) {
      return;
    }

    // add the new range to the buffer
    this.buffers.push(range);

    // sort the buffers based on their start value
    this.buffers.sort((a, b) => a[0] - b[0]);

    // initialize a stack to store the merged ranges
    const stack = [];

    const rangesWithMetadata = [];
    const rangesWithoutMetadata = [];

    for (let i = 0; i < this.buffers.length; ++i) {
      const range = this.buffers[i];

      if (!range) {
        continue;
      }

      if (ignoreRangesWithMetadata && this.bufferMetadata[i] !== undefined) {
        rangesWithMetadata.push(range);
      } else {
        rangesWithoutMetadata.push(range);
      }
    }

    // push the first range to stack
    stack.push(rangesWithoutMetadata[0]);

    // merge overlapping buffers
    for (let i = 1; i < rangesWithoutMetadata.length; i++) {
      // get top element of stack
      const top = stack[stack.length - 1];

      const areTwoRangesConsecutive =
        top[1] + 1 === rangesWithoutMetadata[i][0];

      // if current interval is not overlapping with stack top,
      // push it to the stack
      if (!areTwoRangesConsecutive && top[1] < rangesWithoutMetadata[i][0]) {
        stack.push(rangesWithoutMetadata[i]);
      }
      // else if end of current interval is more than the
      // end of stack top interval, update the stack top
      else if (top[1] < rangesWithoutMetadata[i][1]) {
        top[1] = rangesWithoutMetadata[i][1];
        stack.pop();
        stack.push(top);
      }
    }

    this.buffers = [...rangesWithMetadata, ...stack];
  }

  /**
   * Checks if this interval is contained in one of the buffer ranges
   */
  public containsRange(range: Readonly<BufferRange>): boolean {
    for (const buffer of this.buffers) {
      if (buffer[0] <= range[0] && buffer[1] >= range[1]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the index of the buffer range that contains the given frame.
   */
  public getRangeIndexForFrame(frame: number) {
    return this.buffers.findIndex(
      (range) => range[0] <= frame && range[1] >= frame
    );
  }

  /**
   * Removes buffer range at given index.
   */
  public removeRangeAtIndex(index: number) {
    this.buffers.splice(index, 1);
  }

  /**
   * Resets the buffer.
   */
  public reset() {
    this.buffers = [];
  }

  /**
   * Removes the interval that's present in buffers and returns the remaining interval;
   *
   * @example
   * buffers = [[1,100], [200,300]]
   * input range: [5, 105]
   * output: [101-105]
   */
  public getUnprocessedBufferRange(range: Readonly<BufferRange>) {
    const startContainedInRangeIndex = this.getRangeIndexForFrame(range[0]);

    if (startContainedInRangeIndex === -1) {
      return range;
    }

    const newStart = this.buffers[startContainedInRangeIndex][1] + 1;

    // means input range is already contained, or "processed"
    if (newStart > range[1]) {
      return null;
    }

    return [newStart, range[1]] as const;
  }
}
