import { useEffect } from "react";

// a react hook that returns true when the given key is down
export function useKeyDown(key, handler, deps = []) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === key) {
        handler(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [key, ...deps]);
}
