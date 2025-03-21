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

    return () => {
      observer.disconnect();
    };
  }, [id, setResizing]);
};
