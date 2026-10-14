import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";
import type { GridEvents } from "./useEvents";

export default (id: string, setResizing: (value: boolean) => void) => {
  useEffect(() => {
    let width: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const el = () => document.getElementById(id)?.parentElement;
    const observer = new ResizeObserver(() => {
      const newWidth = el()?.getBoundingClientRect().width;
      if (width === undefined || newWidth === width) {
        return;
      }

      setResizing(true);
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        setResizing(false);
      }, 500);
    });

    const element = el();
    element && observer.observe(element);

    // the baseline is the width the grid last measured itself at, so it is
    // set on grid-mount only. Width changes before a load (e.g. panes
    // applying their sizes) are absorbed by the load's own measurement and
    // must not tear down a grid that is already correctly sized
    const offMount = getEventBus<GridEvents>().on("grid-mount", (mounted) => {
      // only this grid's own mount may re-baseline it
      if (mounted.id !== id) {
        return;
      }
      const current = el()?.getBoundingClientRect().width;
      if (current !== undefined) {
        width = current;
      }
    });

    return () => {
      offMount();
      timeout && clearTimeout(timeout);
      observer.disconnect();
    };
  }, [id, setResizing]);
};
