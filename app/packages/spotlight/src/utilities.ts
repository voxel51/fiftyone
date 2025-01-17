/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export const pixels = (pixels: number) => `${pixels}px`;

export const create = <K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] => {
  return document.createElement(tagName);
};

export const sum = (values: number[]) =>
  values.reduce((sum, next) => sum + next, 0);
