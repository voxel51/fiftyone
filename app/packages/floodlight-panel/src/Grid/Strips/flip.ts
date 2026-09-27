/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { css, FLIP_MS, invert, type Transform } from "./stackLayout";

export type Rects = Map<string, DOMRect>;

export const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** Plays `element` from `from` to its resting `to` transform. */
export const play = (
  element: HTMLElement,
  from: Transform,
  to = "none",
  duration = FLIP_MS,
) => {
  if (reducedMotion() || typeof element.animate !== "function") return;
  element.animate(
    [
      { transform: css(from), transformOrigin: "0 0" },
      { transform: to, transformOrigin: "0 0" },
    ],
    { duration, easing: EASE },
  );
};

/** Plays an untransformed `element` in from the rect it replaces. */
export const flipFrom = (element: HTMLElement, from: DOMRect) =>
  play(element, invert(from, element.getBoundingClientRect()));

export const fadeIn = (element: HTMLElement, duration = FLIP_MS) => {
  if (reducedMotion() || typeof element.animate !== "function") return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration,
    easing: EASE,
  });
};
