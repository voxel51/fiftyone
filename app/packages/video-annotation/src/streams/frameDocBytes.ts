/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** Rough heap cost of a JS object or array header. */
const OBJECT_BYTES = 64;

/**
 * Estimate what holding one frame's label document costs: the stream's copy
 * plus the frame store's parsed copy, which shares the stream's strings (mask
 * payloads, chiefly) but not its objects. Walks the document once.
 */
export const estimateFrameDocBytes = (doc: unknown): number => {
  let strings = 0;
  let structure = 0;
  const stack: unknown[] = [doc];

  while (stack.length > 0) {
    const value = stack.pop();

    if (typeof value === "string") {
      strings += value.length * 2;
    } else if (typeof value === "number" || typeof value === "boolean") {
      structure += 8;
    } else if (Array.isArray(value)) {
      structure += OBJECT_BYTES + value.length * 8;
      stack.push(...value);
    } else if (value && typeof value === "object") {
      const entries = Object.values(value);
      structure += OBJECT_BYTES + entries.length * 16;
      stack.push(...entries);
    }
  }

  return strings + structure * 2;
};
