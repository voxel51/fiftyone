import { beforeEach, describe, expect, test } from "vitest";

import { BufferManager } from ".";

describe("BufferManager class tests", () => {
  const bufferManager: BufferManager = new BufferManager();

  beforeEach(() => {
    bufferManager.reset();
  });

  test("addBufferRangeToBuffer method - no overlap", async () => {
    bufferManager.addNewRange([1, 4]);
    bufferManager.addNewRange([6, 7]);

    const mergedBuffers = bufferManager.buffers;

    // no overlap, so there should be two merged buffers
    expect(mergedBuffers.length).toBe(2);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(4);
    expect(mergedBuffers[1][0]).toBe(6);
    expect(mergedBuffers[1][1]).toBe(7);
  });

  test("addBufferRangeToBuffer method - complete encapsulation", async () => {
    bufferManager.addNewRange([1, 5]);
    bufferManager.addNewRange([2, 4]);

    const mergedBuffers = bufferManager.buffers;

    // buffer [2, 4] should be encapsulated by [1, 5], so only one merged range should exist
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(5);
  });

  test("addBufferRangeToBuffer method - completely encapsulated by existing range", async () => {
    bufferManager.addNewRange([2, 4]);
    bufferManager.addNewRange([1, 5]);

    const mergedBuffers = bufferManager.buffers;

    // buffer [2, 4] should be encapsulated by [1, 5], so only one merged range should exist
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(5);
  });

  test("addBufferRangeToBuffer method - partial encapsulated by existing range", async () => {
    bufferManager.addNewRange([48, 84]);
    bufferManager.addNewRange([48, 105]);

    const mergedBuffers = bufferManager.buffers;

    // we expect [48, 105]
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(48);
    expect(mergedBuffers[0][1]).toBe(105);
  });

  test("addBufferRangeToBuffer method - consecutive ranges", async () => {
    bufferManager.addNewRange([1, 10]);
    bufferManager.addNewRange([11, 20]);

    const mergedBuffers = bufferManager.buffers;

    // we expect [48, 105]
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(20);
  });

  test("addBufferRangeToBuffer method - multiple merges", async () => {
    bufferManager.addNewRange([1, 4]);
    bufferManager.addNewRange([5, 7]);
    bufferManager.addNewRange([2, 6]);

    const mergedBuffers = bufferManager.buffers;

    // all buffer ranges overlap, so there should be only one merged buffer
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(7);
  });

  test("addBufferRangeToBuffer method - ignore ranges with metadata", async () => {
    bufferManager.addNewRange([1, 4]);
    bufferManager.addMetadataToBufferRange(0, "metadata");
    bufferManager.addNewRange([5, 700]);

    const mergedBuffers = bufferManager.buffers;

    expect(mergedBuffers.length).toBe(2);

    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(4);
    expect(mergedBuffers[1][0]).toBe(5);
    expect(mergedBuffers[1][1]).toBe(700);
  });

  test("hasRange method - range exists", async () => {
    bufferManager.addNewRange([1, 4]);
    bufferManager.addNewRange([5, 15]);

    expect(bufferManager.containsRange([2, 3])).toBe(true);
    expect(bufferManager.containsRange([5, 10])).toBe(true);
    expect(bufferManager.containsRange([10, 15])).toBe(true);
    expect(bufferManager.containsRange([12, 17])).toBe(false);
    expect(bufferManager.containsRange([20, 25])).toBe(false);
  });

  test("totalFramesInBuffer method", async () => {
    bufferManager.addNewRange([1, 4]);
    bufferManager.addNewRange([5, 15]);

    expect(bufferManager.totalFramesInBuffer).toBe(15);

    bufferManager.reset();

    expect(bufferManager.totalFramesInBuffer).toBe(0);
  });

  test("getRangeIndexForFrame method", async () => {
    bufferManager.addNewRange([2, 10]);
    bufferManager.addNewRange([12, 25]);

    // check start
    expect(bufferManager.getRangeIndexForFrame(2)).toBe(0);
    expect(bufferManager.getRangeIndexForFrame(12)).toBe(1);
    // check middle
    expect(bufferManager.getRangeIndexForFrame(5)).toBe(0);
    expect(bufferManager.getRangeIndexForFrame(14)).toBe(1);
    // check end
    expect(bufferManager.getRangeIndexForFrame(10)).toBe(0);
    expect(bufferManager.getRangeIndexForFrame(25)).toBe(1);
    // check out of bound
    expect(bufferManager.getRangeIndexForFrame(11)).toBe(-1);
    expect(bufferManager.getRangeIndexForFrame(27)).toBe(-1);
  });

  test("removeRangeAtIndex method", async () => {
    bufferManager.addNewRange([2, 10]);
    bufferManager.addNewRange([12, 25]);

    bufferManager.removeRangeAtIndex(0);

    expect(bufferManager.buffers.length).toBe(1);
    expect(bufferManager.buffers[0][0]).toBe(12);
    expect(bufferManager.buffers[0][1]).toBe(25);

    bufferManager.removeRangeAtIndex(0);
    expect(bufferManager.buffers.length).toBe(0);
  });

  test("removeBufferValue method", async () => {
    bufferManager.addNewRange([2, 10]);
    bufferManager.addNewRange([12, 25]);

    bufferManager.removeBufferValue(5);

    /**
     * new buffer ranges should be:
     * [[2, 4], [6, 10], [12, 25]]
     */
    expect(bufferManager.buffers.length).toBe(3);
    expect(bufferManager.buffers[0][0]).toBe(2);
    expect(bufferManager.buffers[0][1]).toBe(4);
    expect(bufferManager.buffers[1][0]).toBe(6);
    expect(bufferManager.buffers[1][1]).toBe(10);
    expect(bufferManager.buffers[2][0]).toBe(12);
    expect(bufferManager.buffers[2][1]).toBe(25);

    bufferManager.removeBufferValue(12);

    /**
     * new buffer ranges should be:
     * [[2, 4], [6, 10], [13, 25]]
     */
    expect(bufferManager.buffers.length).toBe(3);
    expect(bufferManager.buffers[0][0]).toBe(2);
    expect(bufferManager.buffers[0][1]).toBe(4);
    expect(bufferManager.buffers[1][0]).toBe(6);
    expect(bufferManager.buffers[1][1]).toBe(10);
    expect(bufferManager.buffers[2][0]).toBe(13);
    expect(bufferManager.buffers[2][1]).toBe(25);

    bufferManager.removeBufferValue(10);

    /**
     * new buffer ranges should be:
     * [[2, 4], [6, 9], [13, 25]]
     */
    expect(bufferManager.buffers.length).toBe(3);
    expect(bufferManager.buffers[0][0]).toBe(2);
    expect(bufferManager.buffers[0][1]).toBe(4);
    expect(bufferManager.buffers[1][0]).toBe(6);
    expect(bufferManager.buffers[1][1]).toBe(9);
    expect(bufferManager.buffers[2][0]).toBe(13);
    expect(bufferManager.buffers[2][1]).toBe(25);
  });

  test("getUnprocessedBufferRange method", async () => {
    bufferManager.addNewRange([2, 10]);
    bufferManager.addNewRange([12, 25]);

    const unprocessedRange1 = bufferManager.getUnprocessedBufferRange([5, 15]);

    expect(unprocessedRange1[0]).toBe(11);
    expect(unprocessedRange1[1]).toBe(15);

    bufferManager.reset();

    bufferManager.addNewRange([1, 100]);
    bufferManager.addNewRange([200, 300]);

    const unprocessedRange2 = bufferManager.getUnprocessedBufferRange([5, 105]);

    expect(unprocessedRange2[0]).toBe(101);
    expect(unprocessedRange2[1]).toBe(105);
  });
});
