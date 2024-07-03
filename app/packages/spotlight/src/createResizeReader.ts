/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { RESIZE_TIMEOUT } from "./constants";

export default function createResizeReader(
  element: HTMLDivElement,
  render: (resizing: boolean) => void
) {
  let resizing: boolean = undefined;
  let timeout: ReturnType<typeof setTimeout> = undefined;
  let width = element.getBoundingClientRect().width;

  const observer = new ResizeObserver(([el]) => {
    if (resizing === undefined) {
      resizing = false;
      return;
    }

    if (el.contentRect.width === width) {
      return;
    }

    resizing = true;
    render(true);
    timeout && clearTimeout(timeout);
    timeout = setTimeout(() => {
      resizing = false;
      timeout = undefined;
      render(false);
    }, RESIZE_TIMEOUT);
    width = el.contentRect.width;
  });

  observer.observe(element);

  return {
    destroy: () => {
      observer.disconnect();
    },
    resizing: () => resizing,
  };
}
