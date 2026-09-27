/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useEffect, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

// lookers are reattached at a new size, so wait for a resize to settle
const SETTLE = 150;

/** The element's content size: the first measurement at once, then settled. */
export default function useElementSize(
  ref: RefObject<HTMLElement>,
  enabled = true,
) {
  const [size, setSize] = useState<Size>();

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return undefined;
    let latest: Size | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const first = latest === undefined;
      const next = {
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      };
      latest = next;
      clearTimeout(timeout);
      if (first) setSize(next);
      else timeout = setTimeout(() => setSize(next), SETTLE);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [enabled, ref]);

  return size;
}
