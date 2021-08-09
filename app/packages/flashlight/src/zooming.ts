/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export const createScrollReader = (
  element: HTMLElement,
  render: (zooming: boolean) => void
): void => {
  let zooming = false;
  let scrolling = false;
  let prior = 0;
  let scrollSpeed = 300;
  let timer = undefined;

  element.addEventListener("scroll", () => {
    scrolling = true;
  });

  const updateScrollStatus = () => {
    if (!prior) {
      prior = element.scrollTop;
    } else {
      if (Math.abs(element.scrollTop - prior) > scrollSpeed) {
        zooming = true;
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        timer = setTimeout(function () {
          zooming = false;
          timer = undefined;
        }, 100);
      } else {
        if (timer === undefined) {
          scrolling = false;
        }
      }
      prior = element.scrollTop;
    }
  };

  const animate = () => {
    requestAnimationFrame(animate);
    if (scrolling) {
      updateScrollStatus();
      render(zooming);
    }
  };

  animate();
};
