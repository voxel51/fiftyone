/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { Box } from "./objects";

/** Size of one of the word's pixels, in CSS pixels */
const CELL = 2;
/** As in the grid's storm: one drop per this many square CSS pixels, capped */
const DENSITY = 1300;
const MAX_DROPS = 1100;
/** Drops nearer than this are brand-colored teardrops, the rest grey squares */
const NEAR = 0.55;
/** The grid's storm canvas sits at this opacity; the word's pixels don't */
const STORM_OPACITY = 0.45;
/** A 3×3 pixel-art drop: [column offset, width] per row, as the grid draws it */
const DROP_ROWS: [number, number][] = [
  [1, 1],
  [0, 3],
  [0, 3],
];
const STORM_MS = 700;
const FORM_MS = 1400;
const STAGGER_MS = 600;
const DONE_MS = STORM_MS + FORM_MS + STAGGER_MS;

interface Pixel {
  x: number;
  y: number;
  speed: number;
  /** Depth, 0 far to 1 near, as in the grid's storm */
  z: number;
  color: string;
  delay: number;
  /** The word's pixels gather to these; the rest of the storm fades */
  target?: { x: number; y: number };
  from?: { x: number; y: number };
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const token = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/** The word's pixels: points of its rendered glyphs that are mostly ink */
const sample = (word: HTMLElement, width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.font = getComputedStyle(word).font;
  // a single line sits centered in its box, as the real text does
  ctx.textBaseline = "middle";
  ctx.fillText(word.textContent ?? "", 0, height / 2);
  const { data } = ctx.getImageData(0, 0, width, height);
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      if (data[(y * width + x) * 4 + 3] >= 128) points.push({ x, y });
    }
  }
  return points;
};

/**
 * Starts the screen as a falling pixel storm, gathers the word's pixels out
 * of it while the rest fades, then reports the word assembled so the real
 * text can show. `track` hears the gathering pixels' bounds each frame,
 * relative to the word. Without a canvas (tests) or with reduced motion,
 * the text shows at once.
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
    const ctx = el?.getContext?.("2d");
    if (still || !el || !text || !ctx) {
      setAssembled(true);
      return undefined;
    }
    const screen = el.getBoundingClientRect();
    const box = text.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.ceil(screen.width * ratio);
    el.height = Math.ceil(screen.height * ratio);
    ctx.scale(ratio, ratio);

    const at = { x: box.left - screen.left, y: box.top - screen.top };
    // the grid's pixel storm palette: near drops in the brand colors, far
    // drops in muted greys
    const near = [
      token(el, "--color-brand-primary", "#ff6d04"),
      token(el, "--color-content-palette-purple", "#8b5cf6"),
      token(el, "--color-content-palette-teal", "#0d9488"),
    ];
    const far = [
      token(el, "--color-content-text-tertiary", "#6b6968"),
      token(el, "--color-content-text-muted", "#8f8d8b"),
    ];
    const pick = (colors: string[]) =>
      colors[Math.floor(Math.random() * colors.length)];
    const pixel = (target?: { x: number; y: number }): Pixel => {
      const z = target ? 1 : Math.random() ** 1.6;
      return {
        x: Math.random() * screen.width,
        y: Math.random() * screen.height,
        speed: 60 + z * 200,
        z,
        color: z > NEAR ? pick(near) : pick(far),
        delay: Math.random() * STAGGER_MS,
        target,
      };
    };
    const points = sample(text, Math.ceil(box.width), Math.ceil(box.height));
    if (!points.length) {
      setAssembled(true);
      return undefined;
    }
    const pixels = [
      ...points.map((p) => pixel({ x: at.x + p.x, y: at.y + p.y })),
      ...Array.from(
        {
          length: Math.min(
            MAX_DROPS,
            Math.round((screen.width * screen.height) / DENSITY),
          ),
        },
        () => pixel(),
      ),
    ];

    const start = performance.now();
    let last = start;
    let frame = requestAnimationFrame(function draw(now) {
      const t = now - start;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // the storm thins out over the whole gathering, not ahead of it
      const fade = Math.min(
        1,
        Math.max(0, (t - STORM_MS) / (FORM_MS + STAGGER_MS)),
      );
      ctx.clearRect(0, 0, screen.width, screen.height);
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of pixels) {
        const gathering = p.target && t >= STORM_MS;
        if (gathering && p.target) {
          p.from ??= { x: p.x, y: p.y };
          const e = easeInOut(
            Math.min(1, Math.max(0, (t - STORM_MS - p.delay) / FORM_MS)),
          );
          p.x = p.from.x + (p.target.x - p.from.x) * e;
          p.y = p.from.y + (p.target.y - p.from.y) * e;
          // the box frames only the pixels that have landed
          if (e >= 1) {
            minX = Math.min(minX, p.target.x - at.x);
            minY = Math.min(minY, p.target.y - at.y);
            maxX = Math.max(maxX, p.target.x - at.x + CELL);
            maxY = Math.max(maxY, p.target.y - at.y + CELL);
          }
        }
        if (!gathering) {
          p.y = (p.y + p.speed * dt) % screen.height;
        }
        ctx.fillStyle = p.color;
        if (p.target) {
          ctx.globalAlpha = 1;
          ctx.fillRect(p.x, p.y, CELL, CELL);
          continue;
        }
        ctx.globalAlpha = STORM_OPACITY * (0.25 + p.z * 0.6) * (1 - fade);
        if (p.z > NEAR) {
          for (const [row, [offset, run]] of DROP_ROWS.entries()) {
            ctx.fillRect(
              Math.round(p.x) + offset - 1,
              Math.round(p.y) + row - 2,
              run,
              1,
            );
          }
        } else {
          const size = 1 + p.z * 3;
          ctx.fillRect(p.x, p.y, size, size);
        }
      }
      if (minX < Infinity) {
        tracker.current?.({
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
        });
      }
      if (t < DONE_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        setAssembled(true);
      }
    });
    return () => cancelAnimationFrame(frame);
    // the refs are read once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  return { assembled };
}
