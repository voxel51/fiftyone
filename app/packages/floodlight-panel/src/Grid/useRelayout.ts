/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Relays the grid out in place when its data changes or its zoom re-tiles
 * it: the next instance takes the kept items and the swap animates them.
 */

import type { Response } from "@fiftyone/floodlight";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { Anchor, Host, Instance } from "../host/createHost";
import type { PageSource } from "../host/pageSource";
import type { GridRenderer } from "./gridRenderer";
import { handOff } from "./handoff";
import { animateSwap, measure, nearestSurvivor } from "./relayout";
import { useRelayoutDemo } from "./relayoutDemo";
import type { ItemCache } from "./types";

/** `page` without the ids in `excluded`. */
export const excluding = <P extends Response<number, unknown>>(
  page: P,
  excluded: Set<string>,
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
  excluded: Set<string>;
  interims: WeakSet<object>;
  overlay: RefObject<HTMLElement>;
  scopes: WeakMap<object, GridRenderer<V>>;
  source: PageSource<number, Response<number, V>>;
  zoom: unknown;
}) {
  const animateNext = useRef(false);
  const host = useRef<Host<number, I>>();

  const swap = useCallback(
    (next: I, previous: I | undefined) => {
      const to = scopes.get(next);
      const from = previous && scopes.get(previous);
      const root = container.current;
      const animate =
        animateNext.current &&
        root &&
        from &&
        to &&
        !interims.has(next) &&
        !interims.has(previous);
      if (!interims.has(next)) animateNext.current = false;

      const removed = source.takeRemoved();
      const before =
        animate && from
          ? measure(from.tiles, root.getBoundingClientRect())
          : undefined;
      const gone = new Map<string, { rect: DOMRect; tile: HTMLElement }>();
      for (const id of before ? removed : []) {
        const tile = from?.tiles.get(id);
        const rect = before?.get(id);
        tile && rect && gone.set(id, { rect, tile });
      }

      handOff({
        cache,
        evict: [...removed].filter((id) => !gone.has(id)),
        next: to,
        previous: from,
      });

      if (!before || !to || !root || !overlay.current) return;
      animateSwap({
        before,
        gone,
        overlay: overlay.current,
        root,
        tiles: to.tiles,
      }).then(() => {
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
      for (const id of ids) excluded.add(id);
      relayout(start);
    });
    return () => demo?.answer(undefined);
  }, [demo, excluded, relayout, source]);

  return {
    /** Call with the host once it exists. */
    setHost: (next: Host<number, I> | undefined) => {
      host.current = next;
    },
    swap,
  };
}
