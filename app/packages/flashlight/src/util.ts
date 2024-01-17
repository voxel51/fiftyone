/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export function argMin<T>(array: T[]): number {
  return array
    .map((x, i): [T, number] => [x, i])
    .reduce((r, a) => (a[0] < r[0] ? a : r), [array[0], 0])[1];
}

export const getDims = (
  element: HTMLElement
): { width: number; height: number } => {
  const { width, height } = element.getBoundingClientRect();

  return { width, height };
};
