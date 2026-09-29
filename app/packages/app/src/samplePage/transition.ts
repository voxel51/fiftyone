/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SampleTransition } from "@fiftyone/core";

const MEDIA = '[data-cy="modal-looker-container"]';
const FLY_MS = 280;
const FADE_MS = 120;
// how long a landing waits on the page's media before giving up on it
const SETTLE_MS = 800;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `aspect` fitted inside `box`, centered, as `object-fit: contain` does. */
export const containIn = (box: Box, aspect: number): Box => {
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
};

/** A still of what the tile shows: its canvas copied, else a clone. */
const still = (tile: HTMLElement) => {
  const canvas = tile.querySelector("canvas");
  if (canvas?.width && canvas.height) {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    return copy;
  }
  return tile.cloneNode(true) as HTMLElement;
};

/** Resolves with the first match for `selector` under `root`, or undefined. */
export const appeared = (root: Element, selector: string, within: number) =>
  new Promise<HTMLElement | undefined>((resolve) => {
    const found = root.querySelector<HTMLElement>(selector);
    if (found) return resolve(found);
    const done = (element: HTMLElement | undefined) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      const element = root.querySelector<HTMLElement>(selector);
      element && done(element);
    });
    const timer = window.setTimeout(() => done(undefined), within);
    observer.observe(root, { childList: true, subtree: true });
  });

export const createSampleTransition = (): SampleTransition => {
  let ghost: { element: HTMLElement; from: DOMRect } | undefined;

  const drop = () => {
    ghost?.element.remove();
    ghost = undefined;
  };

  return {
    open(tile, open) {
      drop();
      if (
        !(tile instanceof HTMLElement) ||
        reducedMotion() ||
        typeof tile.animate !== "function"
      ) {
        return open();
      }
      const from = tile.getBoundingClientRect();
      if (!from.width || !from.height) return open();

      const element = still(tile);
      Object.assign(element.style, {
        height: `${from.height}px`,
        left: `${from.left}px`,
        margin: "0",
        pointerEvents: "none",
        position: "fixed",
        top: `${from.top}px`,
        transformOrigin: "0 0",
        width: `${from.width}px`,
        zIndex: "100000",
      });
      document.body.appendChild(element);
      ghost = { element, from };
      return open();
    },

    async land(page) {
      const current = ghost;
      if (!current) return;
      const media = await appeared(page, MEDIA, SETTLE_MS);
      if (!media || ghost !== current) return drop();

      const { element, from } = current;
      const to = containIn(
        media.getBoundingClientRect(),
        from.width / from.height,
      );
      await element
        .animate(
          [
            { transform: "none" },
            {
              transform: `translate(${to.left - from.left}px, ${
                to.top - from.top
              }px) scale(${to.width / from.width}, ${to.height / from.height})`,
            },
          ],
          { duration: FLY_MS, easing: EASE, fill: "forwards" },
        )
        .finished.catch(() => undefined);
    },

    settle(page) {
      const current = ghost;
      if (!current) return;
      const fade = () =>
        current.element
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: FADE_MS,
            fill: "forwards",
          })
          .finished.catch(() => undefined)
          .then(() => ghost === current && drop());
      if (!page) return void fade();
      // the looker shows its canvas once the media has loaded
      appeared(page, `${MEDIA} canvas, ${MEDIA} img, ${MEDIA} video`, SETTLE_MS)
        .then(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            ),
        )
        .then(fade);
    },
  };
};
