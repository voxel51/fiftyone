/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Animates a swap between two instances over the same items: each kept
 * item's tile flies from where the previous instance drew it to its tile in
 * the next one, new tiles fade in, and removed tiles fade out in place.
 */

import { fadeIn, flipFrom, reducedMotion } from "./Strips/flip";
import { FLIP_MS } from "./Strips/stackLayout";

/** The tile element each item is shown in, by item id. */
export type Tiles = Map<string, HTMLElement>;

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

export const intersects = (rect: Box, viewport: Box) =>
  rect.left < viewport.left + viewport.width &&
  rect.left + rect.width > viewport.left &&
  rect.top < viewport.top + viewport.height &&
  rect.top + rect.height > viewport.top;

const same = (a: Box, b: Box) =>
  a.left === b.left &&
  a.top === b.top &&
  a.width === b.width &&
  a.height === b.height;

/** Where each tile inside `viewport` is on screen. */
export const measure = (tiles: Tiles, viewport: Box) => {
  const rects = new Map<string, DOMRect>();
  for (const [id, tile] of tiles) {
    if (!tile.isConnected) continue;
    const rect = tile.getBoundingClientRect();
    intersects(rect, viewport) && rects.set(id, rect);
  }
  return rects;
};

/** `contain` without paint, which would clip a tile to its new row. */
export const withoutPaint = (contain: string) => {
  const keywords =
    contain === "strict"
      ? ["size", "layout", "style"]
      : contain === "content"
        ? ["layout", "style"]
        : contain.split(/\s+/);
  const kept = keywords.filter((keyword) => keyword !== "paint");
  return kept.length ? kept.join(" ") : "none";
};

const unclip = (tiles: Iterable<HTMLElement>, root: HTMLElement) => {
  const restore = new Map<HTMLElement, string>();
  for (const tile of tiles) {
    for (
      let node = tile.parentElement;
      node && node !== root && !restore.has(node);
      node = node.parentElement
    ) {
      const { contain } = getComputedStyle(node);
      if (withoutPaint(contain) === contain) continue;
      restore.set(node, node.style.contain);
      node.style.contain = withoutPaint(contain);
    }
  }
  return () => restore.forEach((value, node) => (node.style.contain = value));
};

/** Moves `tile` into `overlay` over `rect` and fades it out there. */
const fadeOutAt = (tile: HTMLElement, rect: Box, overlay: HTMLElement) => {
  const box = overlay.getBoundingClientRect();
  Object.assign(tile.style, {
    height: `${rect.height}px`,
    left: `${rect.left - box.left}px`,
    position: "absolute",
    top: `${rect.top - box.top}px`,
    width: `${rect.width}px`,
  });
  overlay.appendChild(tile);
  return tile.animate(
    [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(0.9)" },
    ],
    { duration: FLIP_MS, easing: EASE, fill: "forwards" },
  );
};

/**
 * Plays the swap. `before` holds the previous instance's on-screen rects,
 * `gone` the tiles of removed items; resolves once every tile has settled.
 */
export const animateSwap = ({
  before,
  gone,
  overlay,
  root,
  tiles,
}: {
  before: Map<string, DOMRect>;
  gone: Map<string, { rect: DOMRect; tile: HTMLElement }>;
  overlay: HTMLElement;
  root: HTMLElement;
  tiles: Tiles;
}): Promise<void> => {
  if (reducedMotion() || typeof root.animate !== "function") {
    return Promise.resolve();
  }
  const viewport = root.getBoundingClientRect();
  const moving: [HTMLElement, DOMRect | undefined][] = [];
  const animations: Animation[] = [];

  for (const [id, tile] of tiles) {
    const to = tile.getBoundingClientRect();
    const from = before.get(id);
    if (from ? same(from, to) : !intersects(to, viewport)) continue;
    moving.push([tile, from]);
  }
  const restore = unclip(
    moving.map(([tile]) => tile),
    root,
  );
  for (const [tile, from] of moving) {
    const animation = from ? flipFrom(tile, from) : fadeIn(tile);
    animation && animations.push(animation);
  }
  const lifted = [...gone.values()].map(({ rect, tile }) => {
    animations.push(fadeOutAt(tile, rect, overlay));
    return tile;
  });

  return Promise.allSettled(animations.map(({ finished }) => finished)).then(
    () => {
      restore();
      lifted.forEach((tile) => tile.remove());
    },
  );
};

/**
 * The item a rebuild should anchor on when `at` is removed: the next item in
 * the old order that survives, else the previous one.
 */
export const nearestSurvivor = (
  order: string[],
  at: string,
  removed: Set<string>,
) => {
  const index = order.indexOf(at);
  if (index < 0) return undefined;
  for (let i = index + 1; i < order.length; i++) {
    if (!removed.has(order[i])) return order[i];
  }
  for (let i = index - 1; i >= 0; i--) {
    if (!removed.has(order[i])) return order[i];
  }
  return undefined;
};
