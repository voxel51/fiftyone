/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { SCROLL_TIMEOUT, ZERO } from "./constants";

export default function createScrollReader(
  element: HTMLElement,
  render: (zooming: boolean, dispatchOffset?: boolean) => void,
  getScrollSpeedThreshold: () => number
) {
  let destroyed = false;
  let guard = false;
  let prior: number;
  let scrolling = undefined;
  let timeout: ReturnType<typeof setTimeout>;
  let zooming = false;

  element.addEventListener("scroll", () => {
    guard = true;
  });

  element.addEventListener("scrollend", () => {
    guard = false;
    requestAnimationFrame(() => render(zooming, true));
  });

  const updateScrollStatus = () => {
    const threshold = getScrollSpeedThreshold();
    if (threshold === Number.POSITIVE_INFINITY) {
      return false;
    }

    scrolling = prior !== undefined && Math.abs(element.scrollTop - prior);

    if (
      prior === undefined ||
      Math.abs(element.scrollTop - prior) > threshold
    ) {
      zooming = prior !== undefined;
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        scrolling = false;
        timeout = undefined;
        zooming = false;
        render(false);
      }, SCROLL_TIMEOUT);
    }

    prior = element.scrollTop;

    return true;
  };

  const animate = () => {
    if (destroyed) {
      return;
    }

    if (element.parentElement) {
      updateScrollStatus();
      scrolling && prior && render(zooming);
    }
    requestAnimationFrame(animate);
  };

  animate();

  return {
    adjust: (offset: number) => {
      element.scroll(ZERO, element.scrollTop + offset);
    },
    destroy: () => {
      destroyed = true;
    },
    guard: () => guard,
    zooming: () => zooming,
  };
}
