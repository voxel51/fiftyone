/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Focus mode: the header folds away so the samples get the page. "F" toggles
 * it and Escape leaves it, unless the keys belong to something else — typing,
 * or the sample page over the dataset page, where "F" is fullscreen.
 */
export default function useFocusMode(enabled: boolean) {
  const [focused, setFocused] = useState(false);
  const toggle = useCallback(() => setFocused((on) => !on), []);
  const exit = useCallback(() => setFocused(false), []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocused(false);
        return;
      }
      if (
        event.key.toLowerCase() !== "f" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        typing(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setFocused((on) => !on);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return { focused, toggle, exit };
}
