/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useEffect, useRef } from "react";

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

/**
 * Sends key presses to `handle` while the grid is focused, meaning the last
 * pointer press landed inside one of `regions`. `handle` returns whether it
 * consumed the key, which stops the scroller's native paging.
 */
export default function usePageKeys({
  disabled,
  handle,
  regions,
}: {
  disabled: boolean;
  handle: (key: string) => boolean;
  regions: RefObject<HTMLElement>[];
}) {
  const latest = useRef({ disabled, handle, regions });
  latest.current = { disabled, handle, regions };

  useEffect(() => {
    let focused = false;
    const onPointer = (event: PointerEvent) => {
      focused = latest.current.regions.some((region) =>
        region.current?.contains(event.target as Node),
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (!focused || latest.current.disabled || event.defaultPrevented) return;
      if (editable(event.target)) return;
      latest.current.handle(event.key) && event.preventDefault();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
