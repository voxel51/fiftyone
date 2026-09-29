/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

const MODAL_MEDIA = '[data-cy="modal-looker-container"]';
const FLY_MS = 280;
const FADE_MS = 160;
// how long the ghost waits on the modal's media before giving way anyway
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
  if (canvas && canvas.width && canvas.height) {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    return copy;
  }
  return tile.cloneNode(true) as HTMLElement;
};

/** Resolves with `selector`'s element once it exists, or undefined. */
const appeared = (selector: string, within: number) =>
  new Promise<HTMLElement | undefined>((resolve) => {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;
      done(element);
    });
    const timer = window.setTimeout(() => done(undefined), within);
    const done = (element: HTMLElement | undefined) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };
    observer.observe(document.body, { childList: true, subtree: true });
  });

// the media has drawn once its looker mounts an element, a frame later
const drawn = (within: number) =>
  appeared(
    `${MODAL_MEDIA} canvas, ${MODAL_MEDIA} img, ${MODAL_MEDIA} video`,
    within,
  ).then(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

/**
 * Opens a sample from its grid tile: a still of the tile flies to where the
 * modal will show the media, and gives way once the modal has drawn it.
 */
export const flyOpen = <T>(tile: Element | null, open: () => T): T => {
  if (
    !(tile instanceof HTMLElement) ||
    reducedMotion() ||
    typeof tile.animate !== "function"
  ) {
    return open();
  }

  const from = tile.getBoundingClientRect();
  if (!from.width || !from.height) return open();

  const ghost = still(tile);
  Object.assign(ghost.style, {
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
  document.body.appendChild(ghost);

  const result = open();

  appeared(MODAL_MEDIA, SETTLE_MS).then(async (media) => {
    if (!media) return ghost.remove();
    const to = containIn(
      media.getBoundingClientRect(),
      from.width / from.height,
    );
    const flight = ghost.animate(
      [
        { transform: "none" },
        {
          transform: `translate(${to.left - from.left}px, ${
            to.top - from.top
          }px) scale(${to.width / from.width}, ${to.height / from.height})`,
        },
      ],
      { duration: FLY_MS, easing: EASE, fill: "forwards" },
    );
    await Promise.all([
      flight.finished.catch(() => undefined),
      drawn(SETTLE_MS),
    ]);
    await ghost
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        fill: "forwards",
      })
      .finished.catch(() => undefined);
    ghost.remove();
  });

  return result;
};
