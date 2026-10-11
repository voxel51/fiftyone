/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { HeaderFocus } from "./AppHeader";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Focus mode's keys: "F" toggles it and Escape leaves it, unless the keys
 * belong to something else — typing, or a page over this one, where "F" is
 * its own. Pass `enabled: false` to yield them.
 */
export function useFocusKeys(
  enabled: boolean,
  { exit, toggle }: Pick<HeaderFocus, "exit" | "toggle">,
) {
  const handlers = useRef({ exit, toggle });
  handlers.current = { exit, toggle };

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handlers.current.exit();
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
      handlers.current.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * Focus mode as component state: the header folds away so the page gets the
 * window. The state outlives `enabled`, so it holds across a page shown over
 * this one.
 */
export default function useFocusMode(enabled: boolean): HeaderFocus {
  const [focused, setFocused] = useState(false);
  const toggle = useCallback(() => setFocused((on) => !on), []);
  const exit = useCallback(() => setFocused(false), []);

  useFocusKeys(enabled, { exit, toggle });

  return { focused, toggle, exit };
}
