/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ZOOM_TIMEOUT } from "./constants";

/**
 * Attaches a rAF-driven scroll loop to `element` that tracks scroll speed and
 * notifies the grid whether it is in "zooming" (fast-scroll) mode.
 *
 * On each animation frame, if the element is scrolling, `render` is called with
 * the current `zooming` state. When scroll speed exceeds the threshold returned
 * by `getScrollSpeedThreshold`, `zooming` becomes `true` and item rendering is
 * suspended until the speed drops and the debounce timer expires.
 *
 * @param element - The scrollable container to observe.
 * @param render - Called each frame while scrolling; receives `zooming` and an
 *   optional `dispatchOffset` flag that triggers a `rowchange` event.
 * @param getScrollSpeedThreshold - Returns the per-frame pixel delta above which
 *   the grid enters zooming mode. Return `Infinity` to disable zoom detection.
 * @returns An object with `destroy` (removes listeners and cancels the loop) and
 *   `zooming` (returns the current zoom state).
 */
export default function createScrollReader(
  element: HTMLElement,
  render: (zooming: boolean, dispatchOffset?: boolean) => void,
  getScrollSpeedThreshold: () => number
) {
  let animationFrame: ReturnType<typeof requestAnimationFrame>;
  let destroyed = false;
  let prior: number;
  let scrolling = false;
  let timeout: ReturnType<typeof setTimeout>;
  let zooming = false;

  const scroll = () => {
    scrolling = true;
  };
  element.addEventListener("scroll", scroll);

  const scrollEnd = () => {
    scrolling = false;
    zooming = false;
    requestAnimationFrame(() => render(zooming, true));
  };

  element.addEventListener("scrollend", scrollEnd);

  const updateScrollStatus = () => {
    const threshold = getScrollSpeedThreshold();
    if (threshold === Number.POSITIVE_INFINITY) {
      return false;
    }

    if (
      prior === undefined ||
      Math.abs(element.scrollTop - prior) > threshold
    ) {
      zooming = prior !== undefined;
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        zooming = false;
        render(false);
      }, ZOOM_TIMEOUT);
    }

    prior = element.scrollTop;

    return true;
  };

  updateScrollStatus();

  const animate = () => {
    if (destroyed) {
      return;
    }

    if (scrolling) {
      prior && render(zooming, !zooming);
      updateScrollStatus();
    }

    animationFrame = requestAnimationFrame(animate);
  };

  animate();

  return {
    /** Cancels the animation loop and removes all event listeners. */
    destroy: () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(timeout);
      destroyed = true;
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("scrollend", scrollEnd);
    },
    /** Returns `true` while the user is scrolling faster than the speed threshold. */
    zooming: () => zooming,
  };
}
