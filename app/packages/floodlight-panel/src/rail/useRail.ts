/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RowChange } from "@fiftyone/floodlight";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { type Anchor, SLOT } from "../host/createHost";
import { jumpAnchor, type Ranks } from "./jump";
import { jumpTarget, type ScrollSample, visibleEstimate } from "./model";

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
  /** The host's element, to read the active instance's scroll offset. */
  container?: RefObject<HTMLElement>;
  /** The instance scrolls left to right. */
  horizontal?: boolean;
}

export interface Rail {
  /** Rank of the item at the top of the view, once known. */
  anchorRank?: number;
  /** Estimated items on screen, once the grid has scrolled a row. */
  visible?: number;
  /** Rebuilds the grid at a rail position. */
  jump: (position: number, total: number) => void;
}

/**
 * Follows the host's instance for the thumb and jumps by rebuilding through
 * the host. Page keys are `floor(rank / pageSize)`, so a jump lands on the
 * target's page.
 */
// attach() appends the instance's scroller as its slot's last child
const scroller = (container?: RefObject<HTMLElement>) =>
  container?.current?.querySelector(`[${SLOT}="active"]`)?.lastElementChild;

export default function useRail({
  container,
  horizontal = false,
  host,
  instance,
  pageSize,
  ranks,
}: UseRailOptions): Rail {
  const [anchorRank, setAnchorRank] = useState<number>();
  const [visible, setVisible] = useState<number>();

  // a new order starts at the top
  useEffect(() => setAnchorRank(undefined), [ranks]);

  useEffect(() => {
    const at = host?.anchor?.at?.description;
    const rank = at === undefined ? undefined : ranks.get(at);
    rank !== undefined && setAnchorRank(rank);
    if (!instance) return undefined;

    let sample: ScrollSample | undefined;
    const onRow = (event: Event) => {
      const rank = ranks.get((event as RowChange<number>).at.description);
      if (rank === undefined) return;
      setAnchorRank(rank);

      const element = scroller(container);
      if (!element) return;
      const next = {
        rank,
        offset: horizontal ? element.scrollLeft : element.scrollTop,
      };
      const viewport = horizontal ? element.clientWidth : element.clientHeight;
      const estimate = sample && visibleEstimate(sample, next, viewport);
      estimate !== undefined && setVisible(estimate);
      sample = next;
    };
    instance.addEventListener("rowchange", onRow);
    return () => instance.removeEventListener("rowchange", onRow);
  }, [container, horizontal, host, instance, ranks]);

  const jump = useCallback(
    (position: number, total: number) => {
      const target = jumpTarget(position, total, pageSize);
      setAnchorRank(target.rank);
      host?.rebuild(jumpAnchor(target, ranks));
    },
    [host, pageSize, ranks],
  );

  return { anchorRank, jump, visible };
}
