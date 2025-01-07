/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export function argMin<T>(array: T[]): number {
  return array
    .map((x, i): [T, number] => [x, i])
    .reduce((r, a) => (a[0] < r[0] ? a : r), [array[0], 0])[1];
}

export const getDims = (
  horizontal: boolean,
  element: HTMLElement
): { width: number; height: number } => {
  let { width, height } = element.getBoundingClientRect();

  if (horizontal) {
    let tmp = width;
    width = height;
    height = tmp;
  }

  return { width, height };
};
