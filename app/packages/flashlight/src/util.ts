/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export function argMin<T>(array: T[]): number {
  return array
    .map((x, i): [T, number] => [x, i])
    .reduce((r, a) => (a[0] < r[0] ? a : r), [array[0], 0])[1];
}
