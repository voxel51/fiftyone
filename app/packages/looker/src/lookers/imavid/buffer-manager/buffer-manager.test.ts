import { beforeEach, describe, expect, test } from "vitest";

import { BufferManager } from ".";

describe("BufferManager class tests", () => {
  const bufferManager: BufferManager = new BufferManager();

  beforeEach(() => {
    bufferManager.reset();
  });

  test("addBufferRangeToBuffer method - no overlap", async () => {
    bufferManager.addBufferRangeToBuffer([1, 4]);
    bufferManager.addBufferRangeToBuffer([5, 7]);

    const mergedBuffers = bufferManager.buffers;

    // no overlap, so there should be two merged buffers
    expect(mergedBuffers.length).toBe(2);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(4);
    expect(mergedBuffers[1][0]).toBe(5);
    expect(mergedBuffers[1][1]).toBe(7);
  });

  test("addBufferRangeToBuffer method - complete encapsulation", async () => {
    bufferManager.addBufferRangeToBuffer([1, 5]);
    bufferManager.addBufferRangeToBuffer([2, 4]);

    const mergedBuffers = bufferManager.buffers;

    // buffer [2, 4] should be encapsulated by [1, 5], so only one merged range should exist
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(5);
  });

  test("addBufferRangeToBuffer method - completely encapsulated by existing range", async () => {
    bufferManager.addBufferRangeToBuffer([2, 4]);
    bufferManager.addBufferRangeToBuffer([1, 5]);

    const mergedBuffers = bufferManager.buffers;

    // buffer [2, 4] should be encapsulated by [1, 5], so only one merged range should exist
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(5);
  });

  test("addBufferRangeToBuffer method - multiple merges", async () => {
    bufferManager.addBufferRangeToBuffer([1, 4]);
    bufferManager.addBufferRangeToBuffer([5, 7]);
    bufferManager.addBufferRangeToBuffer([2, 6]);

    const mergedBuffers = bufferManager.buffers;

    // all buffer ranges overlap, so there should be only one merged buffer
    expect(mergedBuffers.length).toBe(1);
    expect(mergedBuffers[0][0]).toBe(1);
    expect(mergedBuffers[0][1]).toBe(7);
  });
});
