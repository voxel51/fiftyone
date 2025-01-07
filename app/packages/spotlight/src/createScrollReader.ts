/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { ZOOM_TIMEOUT } from "./constants";

export default function createScrollReader(
  element: HTMLElement,
  render: (zooming: boolean, dispatchOffset?: boolean) => void,
  getScrollSpeedThreshold: () => number
) {
  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
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

    if (element.parentElement) {
      scrolling && prior && render(zooming);
      updateScrollStatus();
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  animate();

  return {
    destroy: () => {
      destroyed = true;
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("scrollend", scrollEnd);

      if (timeout) {
        clearTimeout(timeout);
      }

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    },
    zooming: () => zooming,
  };
}
