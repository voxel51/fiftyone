/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RowChange } from "@fiftyone/floodlight";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Anchor } from "../host/createHost";
import { clamp01, type Extent, extentVisible } from "./model";

export interface UseRailOptions {
  host?: { readonly anchor?: Anchor<number> };
  /** The instance on screen; its `rowchange` moves the thumb. */
  instance?: EventTarget;
  /** A loaded item's place in its order, in [0, 1]. */
  fractionOf: (id: string) => number | undefined;
  /**
   * The fraction one item spans, when the order is counted (1 / total);
   * otherwise the scroll between rows follows the last rows' pace.
   */
  perItem?: number;
  /** The instance's extents, for a thumb sized like a scrollbar's. */
  extent?: () => Extent | undefined;
  /** Subscribes to the view scrolling; returns the unsubscribe. */
  onScroll?: (listener: () => void) => () => void;
}

export interface Rail {
  /** Fraction of the item at the top of the view, once known. */
  fraction?: number;
  /** How many items fill the viewport at the loaded rows' density. */
  visible?: number;
  /** Hears the top's fraction as the view scrolls, between rows too. */
  follow: (listener: (fraction: number) => void) => () => void;
}

type Mark = { fraction: number; scrolled: number };

/**
 * Follows the host's instance for the thumb: each reported row sets the
 * top's fraction from its item, and scrolling between rows interpolates
 * toward the next one.
 */
export default function useRail({
  extent,
  fractionOf,
  host,
  instance,
  onScroll,
  perItem,
}: UseRailOptions): Rail {
  const [fraction, setFraction] = useState<number>();
  const [visible, setVisible] = useState<number>();
  const measure = useRef(extent);
  measure.current = extent;
  const scroll = useRef(onScroll);
  scroll.current = onScroll;
  const followers = useRef(new Set<(fraction: number) => void>());

  // a new order starts at the top
  useEffect(() => setFraction(undefined), [fractionOf]);

  useEffect(() => {
    const at = host?.anchor?.at?.description;
    const anchored = at === undefined ? undefined : fractionOf(at);
    anchored !== undefined && setFraction(anchored);
    if (!instance) return undefined;

    let base: Mark | undefined;
    let pace: number | undefined;

    const onRow = (event: Event) => {
      const next = fractionOf((event as RowChange<number>).at.description);
      if (next === undefined) return;
      const view = measure.current?.();
      const scrolled = view?.scrolled ?? 0;
      if (base && scrolled !== base.scrolled) {
        pace = (next - base.fraction) / (scrolled - base.scrolled);
      }
      base = { fraction: next, scrolled };
      setFraction(next);
      setVisible(view && extentVisible(view));
    };
    const onScroll = () => {
      const view = measure.current?.();
      if (!base || view?.scrolled === undefined || !view.loaded) return;
      const rate =
        perItem === undefined ? pace : (perItem * view.items) / view.loaded;
      if (rate === undefined) return;
      const next = clamp01(
        base.fraction + (view.scrolled - base.scrolled) * rate,
      );
      for (const follower of followers.current) follower(next);
    };
    instance.addEventListener("rowchange", onRow);
    const unsubscribe = scroll.current?.(onScroll);
    return () => {
      instance.removeEventListener("rowchange", onRow);
      unsubscribe?.();
    };
  }, [fractionOf, host, instance, perItem]);

  const follow = useCallback((listener: (fraction: number) => void) => {
    followers.current.add(listener);
    return () => void followers.current.delete(listener);
  }, []);

  return { follow, fraction, visible };
}
