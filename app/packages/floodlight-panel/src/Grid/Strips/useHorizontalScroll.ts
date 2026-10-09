/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useEffect } from "react";
import type { HScroll } from "./hscroll";

/**
 * Drives the matrix's horizontal position from a native scrollbar. Sideways
 * wheels anywhere over the matrix move that scrollbar, and the position
 * reaches rows as a CSS variable, so scrolling renders nothing per pixel.
 */
export default function useHorizontalScroll({
  bar,
  root,
  scroll,
}: {
  bar: RefObject<HTMLDivElement>;
  root: RefObject<HTMLDivElement>;
  scroll: HScroll;
}) {
  useEffect(() => {
    const scrollbar = bar.current;
    const matrix = root.current;
    if (!scrollbar || !matrix) return undefined;

    const paint = () => matrix.style.setProperty("--sx", `${scroll.x}px`);
    const onScroll = () => scroll.set(scrollbar.scrollLeft);
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      scrollbar.scrollLeft += event.deltaX;
    };

    paint();
    const unsubscribe = scroll.subscribe(paint);
    scrollbar.addEventListener("scroll", onScroll, { passive: true });
    matrix.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      unsubscribe();
      scrollbar.removeEventListener("scroll", onScroll);
      matrix.removeEventListener("wheel", onWheel);
    };
  }, [bar, root, scroll]);
}
