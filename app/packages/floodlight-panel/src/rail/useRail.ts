/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RowChange } from "@fiftyone/floodlight";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Anchor } from "../host/createHost";
import { jumpAnchor, type Ranks } from "./jump";
import { type Extent, extentVisible, jumpTarget } from "./model";

/** What the rail needs from the instance host. */
export interface RailHost {
  readonly anchor?: Anchor<number>;
  rebuild(anchor?: Anchor<number>): void;
}

export interface UseRailOptions {
  host?: RailHost;
  /** The instance on screen; its `rowchange` moves the thumb. */
  instance?: EventTarget;
  ranks: Ranks;
  pageSize: number;
  /** The instance's extents, for a thumb sized like a scrollbar's. */
  extent?: () => Extent | undefined;
  /** Subscribes to the view scrolling; returns the unsubscribe. */
  onScroll?: (listener: () => void) => () => void;
}

export interface Rail {
  /** Rank of the item at the top of the view, once known. */
  anchorRank?: number;
  /** How many items fill the viewport at the loaded rows' density. */
  visible?: number;
  /** Rebuilds the grid at a rail position. */
  jump: (position: number, total: number) => void;
  /**
   * Hears the top rank as the view scrolls, fractional between rows, for a
   * thumb that tracks the scroll rather than stepping a row at a time.
   */
  follow: (listener: (rank: number) => void) => () => void;
}

/**
 * Follows the host's instance for the thumb and jumps by rebuilding through
 * the host. Page keys are `floor(rank / pageSize)`, so a jump lands on the
 * target's page.
 */
export default function useRail({
  extent,
  host,
  instance,
  onScroll,
  pageSize,
  ranks,
}: UseRailOptions): Rail {
  const [anchorRank, setAnchorRank] = useState<number>();
  const [visible, setVisible] = useState<number>();
  const measure = useRef(extent);
  measure.current = extent;
  const scroll = useRef(onScroll);
  scroll.current = onScroll;
  const followers = useRef(new Set<(rank: number) => void>());

  // a new order starts at the top
  useEffect(() => setAnchorRank(undefined), [ranks]);

  useEffect(() => {
    const at = host?.anchor?.at?.description;
    const rank = at === undefined ? undefined : ranks.get(at);
    rank !== undefined && setAnchorRank(rank);
    if (!instance) return undefined;

    // the reported row can sit a row down from the top, and reaching the top
    // need not change rows, so a view scrolled to the start reads as rank 0
    const atStart = (rank: number | undefined) =>
      measure.current?.()?.scrolled === 0 &&
      rank !== undefined &&
      rank < pageSize;

    // the last reported row, and how far the view was scrolled then
    let base: { rank: number; scrolled: number } | undefined;

    const onRow = (event: Event) => {
      const rank = ranks.get((event as RowChange<number>).at.description);
      if (rank === undefined) return;
      const next = measure.current?.();
      const top = atStart(rank) ? 0 : rank;
      base = { rank: top, scrolled: next?.scrolled ?? 0 };
      setAnchorRank(top);
      setVisible(next && extentVisible(next));
    };
    const onScroll = () => {
      const next = measure.current?.();
      if (!base || next?.scrolled === undefined || !next.loaded) return;
      if (atStart(base.rank)) {
        base = { rank: 0, scrolled: 0 };
        setAnchorRank(0);
      }
      const perPixel = next.items / next.loaded;
      const rank = Math.max(
        0,
        base.rank + (next.scrolled - base.scrolled) * perPixel,
      );
      for (const follower of followers.current) follower(rank);
    };
    instance.addEventListener("rowchange", onRow);
    const unsubscribe = scroll.current?.(onScroll);
    return () => {
      instance.removeEventListener("rowchange", onRow);
      unsubscribe?.();
    };
  }, [host, instance, pageSize, ranks]);

  const jump = useCallback(
    (position: number, total: number) => {
      const target = jumpTarget(position, total, pageSize, visible);
      setAnchorRank(target.rank);
      host?.rebuild(jumpAnchor(target, ranks));
    },
    [host, pageSize, ranks, visible],
  );

  const follow = useCallback((listener: (rank: number) => void) => {
    followers.current.add(listener);
    return () => void followers.current.delete(listener);
  }, []);

  return { anchorRank, follow, jump, visible };
}
