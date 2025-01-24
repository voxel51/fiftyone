/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { expect, test } from "vitest";
import { closest } from "./closest";

test("calculates closest with top", () => {
  expect(closest([0, 1, 2], -2.5, (i) => i - 2)).toStrictEqual({
    index: 0,
    delta: -0.5,
  });
  expect(closest([0, 1, 2], -1.5, (i) => i - 2)).toStrictEqual({
    index: 1,
    delta: -0.5,
  });
  expect(closest([0, 1, 2], -0.5, (i) => i - 2)).toStrictEqual({
    index: 2,
    delta: -0.5,
  });
});
