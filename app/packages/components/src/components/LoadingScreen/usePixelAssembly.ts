/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useLayoutEffect, useState } from "react";

/** Size of one pixel of the forming text, in CSS pixels */
const CELL = 2;
const TRAVEL_MS = 500;
const STAGGER_MS = 200;
/** How far around the text the pixels start */
const SCATTER = 80;

interface Pixel {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  delay: number;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** The text's pixels: cells of the rendered glyphs that are mostly ink */
const sample = (word: HTMLElement, width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const style = getComputedStyle(word);
  ctx.font = style.font;
  // a single line sits centered in its box, as the real text does
  ctx.textBaseline = "middle";
  ctx.fillText(word.textContent ?? "", 0, height / 2);
  const { data } = ctx.getImageData(0, 0, width, height);
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 128) continue;
      const angle = Math.random() * Math.PI * 2;
      const distance = SCATTER * (0.4 + Math.random() * 0.6);
      pixels.push({
        x,
        y,
        fromX: x + Math.cos(angle) * distance,
        fromY: y + Math.sin(angle) * distance,
        delay: Math.random() * STAGGER_MS,
      });
    }
  }
  return pixels;
};

/**
 * Forms the word from scattered pixels on `canvas`, over the word's own box,
 * then reports it assembled so the real text can show. Without a canvas
 * (tests) or with reduced motion, the text shows at once.
 */
export default function usePixelAssembly(
  canvas: RefObject<HTMLCanvasElement>,
  word: RefObject<HTMLElement>,
  still: boolean,
) {
  const [assembled, setAssembled] = useState(still);

  useLayoutEffect(() => {
    const el = canvas.current;
    const text = word.current;
    const ctx = el?.getContext?.("2d");
    if (still || !el || !text || !ctx) {
      setAssembled(true);
      return undefined;
    }
    const { width, height } = text.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.ceil((width + SCATTER * 2) * ratio);
    el.height = Math.ceil((height + SCATTER * 2) * ratio);
    ctx.scale(ratio, ratio);
    const pixels = sample(text, Math.ceil(width), Math.ceil(height));
    if (!pixels.length) {
      setAssembled(true);
      return undefined;
    }
    ctx.fillStyle = getComputedStyle(text).color;

    const start = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width + SCATTER * 2, height + SCATTER * 2);
      for (const p of pixels) {
        const t = easeOut(
          Math.min(1, Math.max(0, (elapsed - p.delay) / TRAVEL_MS)),
        );
        ctx.globalAlpha = 0.25 + 0.75 * t;
        ctx.fillRect(
          SCATTER + p.fromX + (p.x - p.fromX) * t,
          SCATTER + p.fromY + (p.y - p.fromY) * t,
          CELL,
          CELL,
        );
      }
      if (elapsed < TRAVEL_MS + STAGGER_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        setAssembled(true);
      }
    });
    return () => cancelAnimationFrame(frame);
    // the refs are read once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  return { assembled, scatter: SCATTER };
}
