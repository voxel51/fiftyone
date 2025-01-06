/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { expect, test } from "vitest";
import tile, { TilingException } from "./tile";

test("accepts empty list", () => {
  expect(tile([], 1, true)).toStrictEqual([]);
  expect(tile([], 1, false)).toStrictEqual([]);
});

test("rejects < 1 threshold", () => {
  expect(() => tile([], 0.99, true)).toThrow(TilingException);
  expect(() => tile([], 0, true)).toThrow(TilingException);
  expect(() => tile([], -1, true)).toThrow(TilingException);
});

test("handles one square", () => {
  expect(tile([1], 1, true)).toStrictEqual([1]);
  expect(tile([1], 1, false)).toStrictEqual([1]);

  expect(tile([1], 1.1, false)).toStrictEqual([]);
  expect(tile([1], 1.1, true)).toStrictEqual([1]);
});

test("handles two squares", () => {
  expect(tile([1, 1], 1, true)).toStrictEqual([1, 2]);
  expect(tile([1, 1], 1, false)).toStrictEqual([1, 2]);

  expect(tile([1, 1], 1.1, true)).toStrictEqual([2]);
  expect(tile([1, 1], 1.1, false)).toStrictEqual([2]);
});

test("handles 1, 2, 3", () => {
  expect(tile([1, 2, 3], 3, true)).toStrictEqual([2, 3]);
  expect(tile([1, 2, 3], 3, false)).toStrictEqual([2, 3]);
});

test("handles fibonnaci", () => {
  expect(tile([1, 2, 3, 5], 3, true)).toStrictEqual([2, 3, 4]);
  expect(tile([1, 2, 3, 5], 3, false)).toStrictEqual([2, 3, 4]);
});

test("handles reverse fibonnaci", () => {
  expect(tile([5, 3, 2, 1], 3, true)).toStrictEqual([1, 2, 4]);
  expect(tile([5, 3, 2, 1], 3, false)).toStrictEqual([1, 2, 4]);
});

test("handles reverse fibonnaci", () => {
  expect(tile([5, 3, 2, 1], 3, true)).toStrictEqual([1, 2, 4]);
  expect(tile([5, 3, 2, 1], 3, false)).toStrictEqual([1, 2, 4]);
});
