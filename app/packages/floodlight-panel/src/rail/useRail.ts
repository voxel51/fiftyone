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

    const onRow = (event: Event) => {
      const rank = ranks.get((event as RowChange<number>).at.description);
      if (rank === undefined) return;
      const next = measure.current?.();
      setAnchorRank(atStart(rank) ? 0 : rank);
      setVisible(next && extentVisible(next));
    };
    const onScroll = () => setAnchorRank((rank) => (atStart(rank) ? 0 : rank));
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

  return { anchorRank, jump, visible };
}
