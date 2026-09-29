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

// the longest a close holds the session before letting it reset anyway
const CLOSE_MS = 1500;

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

/** `region` of `canvas`, given in the page's pixels over `box`, as a still. */
const crop = (canvas: HTMLCanvasElement, box: Box, region: Box) => {
  const scale = canvas.width / box.width;
  const copy = document.createElement("canvas");
  copy.width = Math.max(1, Math.round(region.width * scale));
  copy.height = Math.max(1, Math.round(region.height * scale));
  copy
    .getContext("2d")
    ?.drawImage(
      canvas,
      (region.left - box.left) * scale,
      (region.top - box.top) * scale,
      region.width * scale,
      region.height * scale,
      0,
      0,
      copy.width,
      copy.height,
    );
  return copy;
};

const onScreen = (box: Box) =>
  box.width > 0 &&
  box.left + box.width > 0 &&
  box.top + box.height > 0 &&
  box.left < window.innerWidth &&
  box.top < window.innerHeight;

const place = (element: HTMLElement, box: Box) =>
  Object.assign(element.style, {
    height: `${box.height}px`,
    left: `${box.left}px`,
    margin: "0",
    pointerEvents: "none",
    position: "fixed",
    top: `${box.top}px`,
    transformOrigin: "0 0",
    width: `${box.width}px`,
    zIndex: "100000",
  });

const fly = (element: HTMLElement, from: Box, to: Box) =>
  element
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

const tileOf = (sampleId: string) =>
  `[data-sample-id="${
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(sampleId) : sampleId
  }"]`;

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

/** What the sample page drives; the grid sees only `open`. */
export interface AppSampleTransition extends SampleTransition {
  /** Flies the lifted still onto `page`'s media; resolves when it is there. */
  land(page: HTMLElement): Promise<void>;
  /** Removes the still once the page shows its media, or at once. */
  settle(page?: HTMLElement): void;
  /** Holds `afterClose` work until the returned function ends the close. */
  beginClose(): () => void;
  /**
   * Flies a still of `page`'s media back onto the tile of `sampleId` while
   * `fade` runs, once the App behind has shown that tile.
   */
  depart(
    page: HTMLElement,
    sampleId: string | undefined,
    fade: () => Promise<void>,
  ): Promise<void>;
  /** Runs `run` once any close under way has ended. */
  afterClose(run: () => void): void;
}

export const createSampleTransition = (): AppSampleTransition => {
  let ghost: { element: HTMLElement; from: DOMRect } | undefined;
  let closing: Promise<void> | undefined;

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
      place(element, from);
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
      await fly(
        element,
        from,
        containIn(media.getBoundingClientRect(), from.width / from.height),
      );
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

    beginClose() {
      let end: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        end = resolve;
        window.setTimeout(resolve, CLOSE_MS);
      }).then(() => {
        if (closing === current) closing = undefined;
      });
      closing = current;
      return end;
    },

    async depart(page, sampleId, fade) {
      drop();
      const media = page.querySelector<HTMLElement>(MEDIA);
      const canvas = media?.querySelector("canvas");
      if (
        !media ||
        !canvas?.width ||
        !sampleId ||
        reducedMotion() ||
        typeof page.animate !== "function"
      ) {
        await fade();
        return;
      }

      const tile = await appeared(document.body, tileOf(sampleId), SETTLE_MS);
      const to = tile?.getBoundingClientRect();
      if (!to || !onScreen(to)) {
        await fade();
        return;
      }

      // the tile has the media's shape, and the looker draws it contained
      const box = media.getBoundingClientRect();
      const from = containIn(box, to.width / to.height);
      const element = crop(canvas, box, from);
      place(element, from);
      document.body.appendChild(element);
      await Promise.all([fly(element, from, to), fade()]);
      element.remove();
    },

    afterClose(run) {
      closing ? void closing.then(run) : run();
    },
  };
};
