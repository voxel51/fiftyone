/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import { listWindow } from "./list";
import { positionToRank } from "./model";
import type { Rail } from "./useRail";

export interface UseListRailOptions {
  /** The scroller the list scrolls in. */
  root: HTMLElement | null;
  /** Selects the list's items inside `root`, in list order. */
  selector: string;
}

/**
 * A rail over a DOM list: rank is an item's index. A jump scrolls the item
 * to the top of the scroller.
 */
export default function useListRail({
  root,
  selector,
}: UseListRailOptions): Rail {
  const [state, setState] = useState<{ first?: number; visible?: number }>({});

  useEffect(() => {
    if (!root) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      const items = [...root.querySelectorAll<HTMLElement>(selector)].map(
        (item) => ({ top: item.offsetTop, height: item.offsetHeight }),
      );
      const { first, visible } = listWindow(
        items,
        root.scrollTop,
        root.clientHeight,
      );
      setState((last) =>
        last.first === first && last.visible === visible
          ? last
          : { first, visible },
      );
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(read);
    };
    read();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
    };
  }, [root, selector]);

  const jump = useCallback(
    (position: number, total: number) => {
      const index = positionToRank(position, total);
      const item = root?.querySelectorAll<HTMLElement>(selector)[index];
      item && root?.scrollTo({ top: item.offsetTop });
    },
    [root, selector],
  );

  return { anchorRank: state.first, jump, visible: state.visible };
}
