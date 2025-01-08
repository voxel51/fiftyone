/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export const pixels = (pixels: number) => `${pixels}px`;

export const create = <K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] => {
  return document.createElement(tagName);
};
