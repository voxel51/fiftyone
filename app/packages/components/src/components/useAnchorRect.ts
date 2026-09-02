/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A trigger's viewport rect, tracked through scroll and resize, for content
 * portaled to the body that must stay anchored under it — the view bar's
 * stages row. Floating panels that open from a trigger should use voodo's
 * `Popover`, `Combobox`, or `Select` instead; this is for layout that is
 * not an overlay.
 */

import React, { useEffect, useState } from "react";

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
}

/**
 * The trigger's viewport rect (top = its bottom edge), recomputed on scroll
 * and resize so a portaled overlay tracks its anchor. Null while inactive.
 */
export const useAnchorRect = (
  ref: React.RefObject<HTMLElement>,
  active: boolean,
): AnchorRect | null => {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!active || !ref.current) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        setRect({ top: r.bottom, left: r.left, width: r.width });
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);

  return rect;
};
