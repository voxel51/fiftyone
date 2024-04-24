/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { expect, test } from "vitest";
import tile, { TilingException } from "./tile";

test("rejects < 1 threshold", () => {
  expect(() => tile([], 0.99, true)).toBe(0);
  expect(() => tile([], 0, true)).toThrow(TilingException);
  expect(() => tile([], -1, true)).toThrow(TilingException);
});

test("accepts empty list", () => {
  expect(tile([], 1, true)).toStrictEqual([]);
  expect(tile([], 1, false)).toStrictEqual([]);
});
