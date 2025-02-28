/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { DIV } from "./constants";

export const pixels = (pixels: number) => `${pixels}px`;

export const create = <K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] => {
  return document.createElement(tagName);
};

export const createScrollTarget = () => {
  const target = create(DIV);
  target.style.width = "100%";
  target.style.height = "0px";
  return target;
};
