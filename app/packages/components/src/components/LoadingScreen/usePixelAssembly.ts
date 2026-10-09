/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { Box } from "./objects";
import { brand, CELL, type Glyphs, glyphs, sample, write } from "./pixels";

/** How far around the word its pixels start, in CSS pixels */
const SCATTER = 36;
const FORM_MS = 380;
const STAGGER_MS = 120;
/** Each pixel turns from its brand color to the text's once it lands */
const TINT_MS = 100;
/** Then the crisp text takes over from the pixels */
const DISSOLVE_MS = 150;
const LANDED_MS = FORM_MS + STAGGER_MS;
const DONE_MS = LANDED_MS + TINT_MS + DISSOLVE_MS;

interface Pixel {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  delay: number;
}

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Draws the word `t` ms into forming; returns the landed pixels' bounds */
const paint = (
  ctx: CanvasRenderingContext2D,
  pixels: Pixel[],
  word: Glyphs,
  t: number,
): Box | undefined => {
  const dissolve = clamp((t - LANDED_MS - TINT_MS) / DISSOLVE_MS);
  // the text is fully on before the pixels go, so the word never thins
  const shown = 1 - clamp(2 * dissolve - 1);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pixels) {
    const k = clamp((t - p.delay) / FORM_MS);
    const e = easeOut(k);
    const x = p.from.x + (p.to.x - p.from.x) * e;
    const y = p.from.y + (p.to.y - p.from.y) * e;
    const alpha = shown * clamp(k / 0.4);
    const tint = clamp((t - p.delay - FORM_MS) / TINT_MS);
    if (tint < 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, CELL, CELL);
    }
    if (tint > 0) {
      ctx.globalAlpha = alpha * tint;
      ctx.fillStyle = word.color;
      ctx.fillRect(x, y, CELL, CELL);
    }
    if (k >= 1) {
      minX = Math.min(minX, p.to.x);
      minY = Math.min(minY, p.to.y);
      maxX = Math.max(maxX, p.to.x + CELL);
      maxY = Math.max(maxY, p.to.y + CELL);
    }
  }
  if (dissolve > 0) {
    ctx.globalAlpha = clamp(2 * dissolve);
    write(ctx, word);
  }
  ctx.globalAlpha = 1;
  return minX < Infinity
    ? {
        left: minX - word.x,
        top: minY - word.y,
        width: maxX - minX,
        height: maxY - minY,
      }
    : undefined;
};

/**
 * Gathers the word's pixels from a scatter around it, turns them the text's
 * color, then draws the crisp text over them, and reports the word assembled
 * so the real text can take over from an identical canvas. `track` hears the
 * landed pixels' bounds each frame, relative to the word. Without a canvas
 * (tests) or with reduced motion, the text shows at once.
 */
export default function usePixelAssembly(
  canvas: RefObject<HTMLCanvasElement>,
  word: RefObject<HTMLElement>,
  still: boolean,
  track?: (box: Box) => void,
) {
  const [assembled, setAssembled] = useState(still);
  const tracker = useRef(track);
  tracker.current = track;

  useLayoutEffect(() => {
    const el = canvas.current;
    const text = word.current;
    const screen = el?.parentElement;
    const ctx = el?.getContext?.("2d");
    if (still || !el || !text || !screen || !ctx) {
      setAssembled(true);
      return undefined;
    }
    let live = true;
    let frame = 0;

    const begin = () => {
      if (!live) return;
      const origin = screen.getBoundingClientRect();
      const box = text.getBoundingClientRect();
      // whole CSS pixels keep the canvas on the device grid, so its text is
      // as crisp as the page's
      const left = Math.floor(box.left - origin.left - SCATTER);
      const top = Math.floor(box.top - origin.top - SCATTER);
      const width = Math.ceil(box.width) + 2 * SCATTER + 1;
      const height = Math.ceil(box.height) + 2 * SCATTER + 1;
      Object.assign(el.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(width * ratio);
      el.height = Math.round(height * ratio);
      ctx.scale(ratio, ratio);

      const shape = glyphs(text, {
        left: origin.left + left,
        top: origin.top + top,
      });
      const colors = brand(el);
      const pixels = sample(shape, ratio).map((to): Pixel => {
        const angle = Math.random() * Math.PI * 2;
        const r = SCATTER * Math.sqrt(Math.random());
        return {
          from: {
            x: to.x + Math.cos(angle) * r,
            y: to.y + Math.sin(angle) * r,
          },
          to,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * STAGGER_MS,
        };
      });
      if (!pixels.length) {
        setAssembled(true);
        return;
      }

      const start = performance.now();
      frame = requestAnimationFrame(function draw(now) {
        const t = now - start;
        ctx.clearRect(0, 0, width, height);
        const bounds = paint(ctx, pixels, shape, t);
        if (bounds) tracker.current?.(bounds);
        if (t < DONE_MS) {
          frame = requestAnimationFrame(draw);
        } else {
          setAssembled(true);
        }
      });
    };

    // sampled in the text's own font, never a fallback it is about to swap
    const font = getComputedStyle(text).font;
    Promise.resolve(document.fonts?.load(font, text.textContent ?? ""))
      .catch(() => undefined)
      .then(begin);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
    // the refs are read once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  return { assembled };
}
