import { BufferRange, Buffers } from "../../../state";

/**
 * Manages buffer ranges for ImaVid.
 */
export class BufferManager {
  public buffers: Buffers;

  constructor(buffers: Buffers = []) {
    this.buffers = buffers;
  }

  /**
   * Returns the total number of frames in the buffer.
   */
  get totalFramesInBuffer() {
    return this.buffers.reduce(
      (total, range) => total + range[1] - range[0],
      0
    );
  }

  /**
   * Adds a buffer range to the buffer.
   * If the new range overlaps with an existing range, the two ranges are merged.
   * Time complexity: O(nlogn)
   */
  public addBufferRangeToBuffer(range: Readonly<BufferRange>): void {
    // add the new range to the buffer
    this.buffers.push(range);

    // sort the buffers based on their start value
    this.buffers.sort((a, b) => a[0] - b[0]);

    // initialize a stack to store the merged ranges
    const stack = [];

    // push the first range to stack
    stack.push(this.buffers[0]);

    // merge overlapping buffers
    for (let i = 1; i < this.buffers.length; i++) {
      // get top element of stack
      const top = stack[stack.length - 1];

      // if current interval is not overlapping with stack top,
      // push it to the stack
      if (top[1] < this.buffers[i][0]) stack.push(this.buffers[i]);
      // else if end of current interval is more than the
      // end of stack top interval, update the stack top
      else if (top[1] < this.buffers[i][1]) {
        top[1] = this.buffers[i][1];
        stack.pop();
        stack.push(top);
      }
    }

    this.buffers = stack;
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
   * Resets the buffer.
   */
  public reset() {
    this.buffers = [];
  }
}
