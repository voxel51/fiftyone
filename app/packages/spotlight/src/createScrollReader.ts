/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { ZOOM_TIMEOUT } from "./constants";

export default function createScrollReader(
  element: HTMLElement,
  render: (zooming: boolean, dispatchOffset?: boolean) => void,
  getScrollSpeedThreshold: () => number
) {
  let destroyed = false;
  let prior: number;
  let scrolling = false;
  let timeout: ReturnType<typeof setTimeout>;
  let zooming = false;

  element.addEventListener("scroll", () => {
    scrolling = true;
  });

  element.addEventListener("scrollend", () => {
    scrolling = false;
    requestAnimationFrame(() => render(zooming, true));
  });

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

    requestAnimationFrame(animate);
  };

  animate();

  return {
    destroy: () => {
      destroyed = true;
    },
    scrolling: () => scrolling,
  };
}
