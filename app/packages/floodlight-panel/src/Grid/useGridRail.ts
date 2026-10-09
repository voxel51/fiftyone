/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { Anchor } from "../host/createHost";
import type { Extent } from "../rail/model";
import useRail from "../rail/useRail";
import type { OpenedOrder } from "../order/order";
import type { OrderSeek } from "./pageCursors";
import { gridRailMode, isRailed } from "./railModes";
import type { Records } from "./useRecords";
import type { Origin } from "./useSpotlightPager";

interface RailHost {
  readonly anchor?: Anchor<number>;
  rebuild(anchor?: Anchor<number>): void;
}

/**
 * The grid's rail for its order: the thumb follows the top item, a release
 * jumps in place when the target is loaded, otherwise rebuilds at its page
 * (SMALL) or seeks once from a new origin (INDEXED). A new origin rebuilds
 * the grid at its first page.
 */
export default function useGridRail({
  extent,
  fractions,
  host,
  instance,
  onScroll,
  order,
  origin,
  pageSize,
  paged,
  seek,
  sequences,
}: {
  extent: () => Extent | undefined;
  fractions: Records;
  host?: RailHost;
  instance?: EventTarget;
  onScroll: (listener: () => void) => () => void;
  order: OpenedOrder | undefined;
  origin: Origin;
  pageSize: number;
  paged: boolean;
  seek: (to: OrderSeek) => void;
  sequences: Records;
}) {
  const mode = useMemo(() => gridRailMode(order, paged), [order, paged]);
  const railed = isRailed(mode) ? mode : undefined;
  const fractionOf = useCallback(
    (id: string) => fractions.get(id),
    [fractions],
  );
  const rail = useRail({
    extent,
    fractionOf,
    host,
    instance,
    onScroll,
    perItem: railed?.perItem,
  });

  const shown = useRef(origin.id);
  useLayoutEffect(() => {
    if (shown.current === origin.id) return;
    shown.current = origin.id;
    host?.rebuild({ key: 0 });
  }, [host, origin.id]);

  const jump = useCallback(
    (position: number) => {
      if (!railed) return;
      const plan = railed.jump(
        position,
        rail.visible,
        { fractions, sequences },
        pageSize,
      );
      "anchor" in plan ? host?.rebuild(plan.anchor) : seek(plan.seek);
    },
    [fractions, host, pageSize, rail.visible, railed, seek, sequences],
  );

  const follow = useCallback(
    (listener: (position: number) => void) =>
      rail.follow(
        (fraction) =>
          railed && listener(railed.position(fraction, rail.visible)),
      ),
    [rail, railed],
  );

  return {
    follow,
    jump,
    mode,
    position:
      railed && rail.fraction !== undefined
        ? railed.position(rail.fraction, rail.visible)
        : undefined,
    seekValue: useCallback((value: unknown) => seek({ value }), [seek]),
    visible: rail.visible,
  };
}

export type GridRailState = ReturnType<typeof useGridRail>;
