/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * (SMALL) or seeks once from a new origin (INDEXED).
 *
 * A release holds the thumb where it was let go until the instance the jump
 * builds is on screen and reports its top row, so the outgoing instance
 * never pulls it back. A new drag drops the hold.
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
  ready,
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
  /** The host shows its newest instance. */
  ready: boolean;
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

  // the released position, and the instance on screen at the release
  const [held, setHeld] = useState<{ position: number; from?: EventTarget }>();
  const holding = useRef(held);
  holding.current = held;
  const settled =
    held && ready && rail.from !== undefined && rail.from !== held.from;
  useLayoutEffect(() => {
    settled && setHeld(undefined);
  }, [settled]);

  // a seek rebuilds at its page; new data resets the origin, and the grid
  // starts over or reorders on its own
  const shown = useRef(origin);
  useLayoutEffect(() => {
    if (shown.current === origin) return;
    shown.current = origin;
    origin.seek && host?.rebuild({ key: 0 });
  }, [host, origin]);

  const jump = useCallback(
    (position: number) => {
      if (!railed) return;
      setHeld({ position, from: instance });
      const plan = railed.jump(
        position,
        rail.visible,
        { fractions, sequences },
        pageSize,
      );
      "anchor" in plan ? host?.rebuild(plan.anchor) : seek(plan.seek);
    },
    [
      fractions,
      host,
      instance,
      pageSize,
      rail.visible,
      railed,
      seek,
      sequences,
    ],
  );

  const follow = useCallback(
    (listener: (position: number) => void) =>
      rail.follow(
        (fraction) =>
          railed &&
          !holding.current &&
          listener(railed.position(fraction, rail.visible)),
      ),
    [rail, railed],
  );

  return {
    /** Hears a rail drag start or end; a start drops the hold. */
    drag: useCallback((dragging: boolean) => {
      dragging && setHeld(undefined);
    }, []),
    follow,
    jump,
    mode,
    position:
      railed && held && !settled
        ? held.position
        : railed && rail.fraction !== undefined
          ? railed.position(rail.fraction, rail.visible)
          : undefined,
    seekValue: useCallback((value: unknown) => seek({ value }), [seek]),
    visible: rail.visible,
  };
}

export type GridRailState = ReturnType<typeof useGridRail>;
