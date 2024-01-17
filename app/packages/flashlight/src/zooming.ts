/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export const createScrollReader = (
  element: HTMLElement,
  render: (zooming: boolean) => void,
  getScrollSpeedThreshold: () => number
) => {
  let destroyed = false;
  let prior = 0;
  let scrolling = false;
  let timer = undefined;
  let zooming = false;

  const listener = () => {
    scrolling = true;
    updateScrollStatus() && !zooming && render(zooming);
  };

  element.addEventListener("scroll", listener);

  const updateScrollStatus = () => {
    const threshold = getScrollSpeedThreshold();
    if (threshold === Infinity) {
      return false;
    }

    if (!prior) {
      if (Math.abs(element.scrollTop - prior) > threshold) {
        zooming = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        timer = setTimeout(function () {
          zooming = false;
          timer = undefined;
          render(false);
        }, 350);
      } else if (timer === undefined) {
        scrolling = false;
      }
    }
    prior = element.scrollTop;

    return true;
  };

  const animate = () => {
    if (!destroyed) {
      requestAnimationFrame(animate);
      scrolling && updateScrollStatus() && zooming && render(zooming);
    }
  };

  animate();

  return () => {
    destroyed = true;
    element.removeEventListener("scroll", listener);
  };
};
