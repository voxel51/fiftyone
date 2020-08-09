import { useEffect } from "react";

export const useResizeHandler = (handler, deps = []) => {
  useEffect(() => {
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  }, deps);
};
