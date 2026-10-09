/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Relays the grid out in place when its data changes or its zoom re-tiles
 * it: the next instance takes the kept items and the swap animates them.
 */

import type { Response } from "@fiftyone/floodlight";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { BoundedMap } from "../host/bounded";
import type { Anchor, Host, Instance } from "../host/createHost";
import type { PageSource } from "../host/pageSource";
import type { GridRenderer } from "./gridRenderer";
import { handOff } from "./handoff";
import { animateSwap, measure, nearestSurvivor } from "./relayout";
import { useRelayoutDemo } from "./relayoutDemo";
import type { ItemCache } from "./types";

/** Ids the demo removed from view, the oldest forgotten past its limit. */
export type Excluded = BoundedMap<string, true>;

/** `page` without the ids in `excluded`. */
export const excluding = <P extends Response<number, unknown>>(
  page: P,
  excluded: Excluded,
): P =>
  excluded.size
    ? {
        ...page,
        items: page.items.filter(({ id }) => !excluded.has(id.description)),
      }
    : page;

export default function useRelayout<I extends Instance, V>({
  cache,
  container,
  dataReset,
  excluded,
  interims,
  overlay,
  scopes,
  source,
  zoom,
}: {
  cache: ItemCache;
  container: RefObject<HTMLElement>;
  dataReset: unknown;
  /** Ids the demo removed from view; the page source filters them out. */
  excluded: Excluded;
  interims: WeakSet<object>;
  overlay: RefObject<HTMLElement>;
  scopes: WeakMap<object, GridRenderer<V>>;
  source: PageSource<number, Response<number, V>>;
  zoom: unknown;
}) {
  const animateNext = useRef(false);
  // the next swap shows the same items in a new order: what leaves fades out
  // and stays cached, since it may come back
  const reorderNext = useRef(false);
  const host = useRef<Host<number, I>>();
  const animations = useRef(0);

  const swap = useCallback(
    (next: I, previous: I | undefined) => {
      const to = scopes.get(next);
      const from = previous && scopes.get(previous);
      const root = container.current;
      const animate =
        animateNext.current &&
        root &&
        from &&
        // a drag's interim builds animate too, so tiles follow the resize
        to;
      const reorder = reorderNext.current && !interims.has(next);
      if (!interims.has(next)) {
        animateNext.current = false;
        reorderNext.current = false;
      }

      const deleted = source.takeRemoved();
      const before =
        animate && from
          ? measure(from.tiles, root.getBoundingClientRect())
          : undefined;
      const lift = (ids: Iterable<string>) => {
        const gone = new Map<string, { rect: DOMRect; tile: HTMLElement }>();
        for (const id of before ? ids : []) {
          const tile = from?.tiles.get(id);
          const rect = before?.get(id);
          tile && rect && gone.set(id, { rect, tile });
        }
        return gone;
      };

      let gone: ReturnType<typeof lift>;
      if (reorder) {
        // the next instance's tiles exist once the hand-off flushes them, so
        // what left is known only after it; nothing is evicted, it may return
        handOff({ cache, next: to, previous: from });
        gone = lift(
          [...(from?.tiles.keys() ?? [])].filter((id) => !to?.tiles.has(id)),
        );
      } else {
        gone = lift(deleted);
        handOff({
          cache,
          evict: [...deleted].filter((id) => !gone.has(id)),
          next: to,
          previous: from,
        });
      }

      if (!before || !to || !root || !overlay.current) return;
      animations.current++;
      animateSwap({
        before,
        gone,
        overlay: overlay.current,
        root,
        tiles: to.tiles,
      }).then(() => {
        animations.current--;
        if (reorder) return;
        for (const id of gone.keys()) !cache.isShown(id) && cache.evict(id);
      });
    },
    [cache, container, interims, overlay, scopes, source],
  );

  /** Refetches every page and rebuilds at `start`, animating the swap. */
  const relayout = useCallback(
    (start?: Anchor<number>) => {
      animateNext.current = true;
      source.invalidate();
      host.current?.rebuild(start);
    },
    [source],
  );

  const lastData = useRef(dataReset);
  useEffect(() => {
    if (lastData.current === dataReset) return;
    lastData.current = dataReset;
    relayout();
  }, [dataReset, relayout]);

  // a zoom change re-tiles over the same items, so animate them to their rows
  const lastZoom = useRef(zoom);
  useEffect(() => {
    if (lastZoom.current === zoom) return;
    lastZoom.current = zoom;
    animateNext.current = true;
  }, [zoom]);

  const demo = useRelayoutDemo();
  useEffect(() => {
    demo?.answer(async (ids) => {
      const current = host.current;
      if (!current || !ids.size) return;

      const anchor = current.anchor;
      let start = anchor;
      const at = anchor?.at?.description;
      if (anchor && at && ids.has(at)) {
        // the anchor leaves: start at its neighbor in the page it headed
        const order = (await source.get(anchor.key)).items.map(
          (item) => item.id.description,
        );
        const next = nearestSurvivor(order, at, ids);
        start = next
          ? { key: anchor.key, at: { description: next, fraction: 0 } }
          : { key: anchor.key };
      }
      for (const id of ids) excluded.set(id, true);
      relayout(start);
    });
    return () => demo?.answer(undefined);
  }, [demo, excluded, relayout, source]);

  /** Rebuilds the same items in a new order at `start`, animating the swap. */
  const reorder = useCallback((start?: Anchor<number>) => {
    animateNext.current = true;
    reorderNext.current = true;
    host.current?.rebuild(start);
  }, []);

  /** The next swap animates its items to their new places. */
  const animate = useCallback(() => {
    animateNext.current = true;
  }, []);

  return {
    animate,
    /** Whether a swap is still animating its tiles. */
    animating: useCallback(() => animations.current > 0, []),
    reorder,
    /** Call with the host once it exists. */
    setHost: (next: Host<number, I> | undefined) => {
      host.current = next;
    },
    swap,
  };
}
