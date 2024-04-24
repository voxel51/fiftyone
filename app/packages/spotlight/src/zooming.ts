/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export const createScrollReader = (
  element: HTMLElement,
  render: (zooming: boolean) => void,
  getScrollSpeedThreshold: () => number
) => {
  let prior: number;
  let timer: ReturnType<typeof setTimeout>;
  let zooming = false;
  let destroyed = false;
  let scrolling = undefined;

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
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      timer = setTimeout(() => {
        zooming = false;
        timer = undefined;
        scrolling = false;
        render(false);
      }, 400);
    }

    prior = element.scrollTop;

    return true;
  };

  const animate = () => {
    if (!destroyed) {
      requestAnimationFrame(animate);
      if (element.parentElement) {
        updateScrollStatus();
        scrolling && prior && render(zooming);
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
    zooming: () => zooming,
  };
};
