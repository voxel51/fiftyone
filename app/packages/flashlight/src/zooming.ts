/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

export const createScrollReader = (
  element: HTMLElement,
  horizontal: boolean,
  render: (zooming: boolean) => void,
  getScrollSpeendThreshold: () => number
): void => {
  let zooming = false;
  let scrolling = false;
  let prior = 0;
  let timer = undefined;

  element.addEventListener("scroll", () => {
    scrolling = true;
    updateScrollStatus() && !zooming && render(zooming);
  });

  const updateScrollStatus = () => {
    const threshold = getScrollSpeendThreshold();
    if (threshold === Infinity) {
      return false;
    }
    if (!prior) {
      prior = horizontal ? element.scrollLeft : element.scrollTop;
    } else {
      if (
        Math.abs(
          (horizontal ? element.scrollLeft : element.scrollTop) - prior
        ) > threshold
      ) {
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
      } else {
        if (timer === undefined) {
          scrolling = false;
        }
      }
      prior = horizontal ? element.scrollLeft : element.scrollTop;
    }

    return true;
  };

  const animate = () => {
    requestAnimationFrame(animate);
    scrolling && updateScrollStatus() && zooming && render(zooming);
  };

  animate();
};
