/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export const createScrollReader = (
  element: HTMLElement,
  render: (zooming: boolean) => void,
  getScrollSpeedThreshold: () => number
) => {
  let prior: number;
  let timer: number;
  let zooming = false;
  let destroyed = false;
  let scrolling;

  const updateScrollStatus = () => {
    const threshold = getScrollSpeedThreshold();
    if (threshold === Infinity) {
      return false;
    }

    scrolling = prior !== undefined && Math.abs(element.scrollTop - prior);

    if (
      prior === undefined ||
      Math.abs(element.scrollTop - prior) > threshold
    ) {
      zooming = prior !== undefined;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      timer = setTimeout(function () {
        zooming = false;
        timer = undefined;
        scrolling = false;
        render(false);
      }, 300);
    }

    prior = element.scrollTop;

    return true;
  };

  const animate = () => {
    if (!destroyed) {
      requestAnimationFrame(animate);
      if (element.parentElement) {
        updateScrollStatus();
        scrolling && render(zooming);
      }
    }
  };

  animate();

  return {
    adjust: (offset: number) => {
      element.scroll(0, element.scrollTop + offset);
    },
    destroy: () => {
      destroyed = true;
    },
  };
};
