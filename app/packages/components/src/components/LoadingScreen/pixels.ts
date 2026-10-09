/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { baseline } from "./objects";

/** Size of one of the word's pixels, in CSS pixels */
export const CELL = 2;
/** Share of a cell the glyphs must ink for it to become one of the pixels */
const INKED = 0.4;

export interface Glyphs {
  text: string;
  font: string;
  color: string;
  /** The word's box on the canvas, and its baseline within it */
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
}

const token = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/** The brand colors the grid's storm draws its near drops in */
export const brand = (el: Element) => [
  token(el, "--color-brand-primary", "#ff6d04"),
  token(el, "--color-content-palette-purple", "#8b5cf6"),
  token(el, "--color-content-palette-teal", "#0d9488"),
];

/** The word as the page renders it, relative to `origin` */
export const glyphs = (
  word: HTMLElement,
  origin: { left: number; top: number },
): Glyphs => {
  const style = getComputedStyle(word);
  const box = word.getBoundingClientRect();
  const ruler = document.createElement("canvas").getContext("2d");
  if (ruler) ruler.font = style.font;
  return {
    text: word.textContent ?? "",
    font: style.font,
    color: style.color,
    x: box.left - origin.left,
    y: box.top - origin.top,
    width: box.width,
    height: box.height,
    baseline: ruler ? baseline(ruler, box.height) : box.height * 0.75,
  };
};

export const write = (ctx: CanvasRenderingContext2D, word: Glyphs) => {
  ctx.font = word.font;
  ctx.fillStyle = word.color;
  ctx.fillText(word.text, word.x, word.y + word.baseline);
};

/** Average ink of one cell, 0 to 1, from a device-resolution image */
const coverage = (image: ImageData, x: number, y: number, ratio: number) => {
  const [x0, x1] = [Math.round(x * ratio), Math.round((x + CELL) * ratio)];
  const [y0, y1] = [Math.round(y * ratio), Math.round((y + CELL) * ratio)];
  let ink = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      ink += image.data[(py * image.width + px) * 4 + 3];
    }
  }
  return ink / ((x1 - x0) * (y1 - y0) * 255);
};

/**
 * The cells of the word's glyphs on the canvas: drawn at the device's
 * resolution exactly where the page draws them, and kept where enough of a
 * cell is ink, so the pixels land on the text that replaces them
 */
export const sample = (word: Glyphs, ratio: number) => {
  const canvas = document.createElement("canvas");
  const [left, top] = [Math.floor(word.x), Math.floor(word.y)];
  const width = Math.ceil(word.width) + CELL;
  const height = Math.ceil(word.height) + CELL;
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.scale(ratio, ratio);
  write(ctx, { ...word, x: word.x - left, y: word.y - top });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y + CELL <= height; y += CELL) {
    for (let x = 0; x + CELL <= width; x += CELL) {
      if (coverage(image, x, y, ratio) >= INKED) {
        cells.push({ x: left + x, y: top + y });
      }
    }
  }
  return cells;
};
