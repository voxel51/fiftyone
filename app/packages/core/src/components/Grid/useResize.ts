import { useEffect } from "react";

export default (id: string, setResizing: (value: boolean) => void) => {
  useEffect(() => {
    let width: number;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const el = () => document.getElementById(id)?.parentElement;
    const observer = new ResizeObserver(() => {
      const element = el();
      if (element && width === undefined) {
        width = element.getBoundingClientRect().width;
        return;
      }

      const newWidth = el()?.getBoundingClientRect().width;
      if (newWidth === width) {
        return;
      }

      setResizing(true);
      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        if (element) {
          width = element?.getBoundingClientRect().width;
        }

        setResizing(false);
      }, 500);
    });

    const element = el();
    element && observer.observe(element);

    // the grid measures itself when it loads, so resynchronize the baseline
    // width then. A layout settle that lands between the observer's initial
    // measurement and the load (e.g. panes applying their sizes) would
    // otherwise compare against a stale baseline and tear down a grid that
    // is already correctly sized
    const sync = () => {
      const current = el()?.getBoundingClientRect().width;
      if (current !== undefined) {
        width = current;
      }
    };
    document.addEventListener("grid-mount", sync);

    return () => {
      document.removeEventListener("grid-mount", sync);
      observer.disconnect();
    };
  }, [id, setResizing]);
};
