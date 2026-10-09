/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Stack geometry. Each layer is its item at its native aspect ratio, fitted
 * in the front box and anchored bottom-left, so every layer recedes up and
 * right from the same corner. Depth is a transform (with
 * `transform-origin: 0 0`) that shrinks a layer toward its own top-right
 * corner and shifts it up and right, so each one peeks out.
 */

import { STACK_DEPTH } from "./stackModel";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

const PAD = 6;
const SHRINK = 0.05;
const DIM = 0.16;
/** How much larger the leaving front item grows as it flies at the viewer. */
const FLY = 0.18;

export const MOTION_MS = 180;
export const FLIP_MS = 250;

/** Pixels each layer peeks out past the one in front of it. */
export const layerStep = (height: number) =>
  Math.min(10, Math.max(4, Math.round(height * 0.05)));

/** The front item's box inside a cell, leaving room for the layers behind. */
export const frontBox = (
  width: number,
  height: number,
  depth = STACK_DEPTH,
): Box => {
  const reserve = (depth - 1) * layerStep(height);
  return {
    left: PAD,
    top: PAD + reserve,
    width: Math.max(0, width - 2 * PAD - reserve),
    height: Math.max(0, height - 2 * PAD - reserve),
  };
};

/** An item's rect: its aspect ratio fitted (contain) in `box`, bottom-left. */
export const layerRect = (box: Box, aspectRatio: number): Box => {
  const ratio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const wide = ratio >= box.width / (box.height || 1);
  const width = Math.round(wide ? box.width : box.height * ratio);
  const height = Math.round(wide ? box.width / ratio : box.height);
  return {
    left: box.left,
    top: box.top + box.height - height,
    width,
    height,
  };
};

export const depthTransform = (
  depth: number,
  box: Box,
  step: number,
): Transform => {
  const s = 1 - depth * SHRINK;
  return {
    x: depth * step + box.width * (1 - s),
    y: -depth * step,
    sx: s,
    sy: s,
  };
};

/** The leaving front item: grown about its center. */
export const flyTransform = (box: Box): Transform => {
  const s = 1 + FLY;
  return {
    x: (-box.width * FLY) / 2,
    y: (-box.height * FLY) / 2,
    sx: s,
    sy: s,
  };
};

export const layerDim = (depth: number) => Math.min(0.8, depth * DIM);

export const css = ({ x, y, sx, sy }: Transform) =>
  `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;

/** The transform (origin 0 0) that draws a `to`-sized element over `from`. */
export const invert = (
  from: Pick<DOMRect, "left" | "top" | "width" | "height">,
  to: Pick<DOMRect, "left" | "top" | "width" | "height">,
): Transform => ({
  x: from.left - to.left,
  y: from.top - to.top,
  sx: to.width ? from.width / to.width : 1,
  sy: to.height ? from.height / to.height : 1,
});
