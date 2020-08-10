import { useEffect } from "react";

export const useResizeHandler = (handler, deps = []) => {
  useEffect(() => {
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  }, deps);
};

export const useKeydownHandler = (handler, deps = []) => {
  useEffect(() => {
    document.body.addEventListener("keydown", handler);
    return () => {
      document.body.removeEventListener("keydown", handler);
    };
  }, deps);
};
