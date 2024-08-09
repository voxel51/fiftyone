import { DependencyList, useEffect } from "react";

/**
 * a react hook that calls the handler when a given key is down
 */
export default function useKeyDown(
  key: KeyboardEvent["key"],
  handler: (down: boolean, e: KeyboardEvent) => void,
  deps: DependencyList = []
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === key) {
        handler(true, e);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [key, handler, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
