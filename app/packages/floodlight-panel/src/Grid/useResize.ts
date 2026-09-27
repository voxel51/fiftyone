import { useEffect } from "react";

// A resize means a new instance, built once the size stops changing.
const SETTLE = 500;

/**
 * Flags the grid as resizing while its cross extent (width, or height when
 * `horizontal`) changes, and clears the flag once it settles.
 */
export default (
  id: string,
  horizontal: boolean,
  setResizing: (value: boolean) => void,
) => {
  useEffect(() => {
    let extent: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const rect = document
        .getElementById(id)
        ?.parentElement?.getBoundingClientRect();
      return horizontal ? rect?.height : rect?.width;
    };
    const observer = new ResizeObserver(() => {
      const next = measure();
      if (extent === undefined || next === extent) {
        return;
      }

      setResizing(true);
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        setResizing(false);
      }, SETTLE);
    });

    const element = document.getElementById(id)?.parentElement;
    element && observer.observe(element);

    // the baseline is the extent the grid last measured itself at, so it is
    // set on grid-mount only. Changes before a load (e.g. panes applying
    // their sizes) are absorbed by the load's own measurement and must not
    // tear down a grid that is already correctly sized
    const sync = (event: Event) => {
      // only this grid's own mount may re-baseline it
      if ((event as CustomEvent).detail?.id !== id) {
        return;
      }
      const current = measure();
      if (current !== undefined) {
        extent = current;
      }
    };
    document.addEventListener("grid-mount", sync);

    return () => {
      document.removeEventListener("grid-mount", sync);
      timeout && clearTimeout(timeout);
      observer.disconnect();
    };
  }, [horizontal, id, setResizing]);
};
