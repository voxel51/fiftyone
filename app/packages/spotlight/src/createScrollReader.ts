/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { SCROLL_TIMEOUT } from "./constants";

export default function createScrollReader(
  element: HTMLElement,
  render: (zooming: boolean, dispatchOffset?: boolean) => void,
  getScrollSpeedThreshold: () => number
) {
  let destroyed = false;
  let prior: number;
  let scrolling = undefined;
  let timeout: ReturnType<typeof setTimeout>;
  let zooming = false;

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
        render(false, true);
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
    destroy: () => {
      destroyed = true;
    },
    scrolling: () => scrolling,
  };
}
