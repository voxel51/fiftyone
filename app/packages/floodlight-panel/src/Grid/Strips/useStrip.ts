/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Owns one inner horizontal Floodlight instance: created while its host is
 * near the scroller's viewport, destroyed when it leaves, when its query
 * or height changes, or on unmount.
 */

import Spotlight from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { type RefObject, useContext, useEffect, useRef, useState } from "react";
import {
  createPageGetter,
  type PageVariables,
  routeWheel,
} from "../samplePages";
import { PAGE_SIZE } from "../useSpotlightPager";
import { scopeRenderer } from "../../host/ownership";
import { StripsContext } from "./context";

// Mount a screen ahead so strips are populated before they scroll in.
const ROOT_MARGIN = "100% 100%";

const useNearViewport = (
  ref: RefObject<HTMLElement>,
  root: HTMLElement | null,
) => {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !root) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { root, rootMargin: ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, root]);

  return near;
};

// A new cross extent (the strip's height) means a new instance, built once
// the height stops changing.
const SETTLE = 500;

const useSettledHeight = (ref: RefObject<HTMLElement>) => {
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let measured: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (next: number) => {
      measured = next;
      setHeight(next);
    };
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.height;
      clearTimeout(timeout);
      if (measured === undefined) settle(next);
      else if (next !== measured)
        timeout = setTimeout(() => settle(next), SETTLE);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [ref]);

  return height;
};

/**
 * @returns the host ref to attach the instance to, and the first page's
 *   sample count (`null` until it resolves).
 */
export default function useStrip(variables: PageVariables, recordBase = 0) {
  const strips = useContext(StripsContext);
  if (!strips) throw new Error("useStrip requires a StripsContext");

  const host = useRef<HTMLDivElement>(null);
  const near = useNearViewport(host, strips.root);
  const height = useSettledHeight(host);
  const [first, setFirst] = useState<{
    count: number;
    for: PageVariables;
  } | null>(null);
  const count = first?.for === variables ? first.count : null;
  const empty = count === 0;

  useEffect(() => {
    const element = host.current;
    if (!near || empty || !element || !height) return undefined;

    const { records, renderer } = strips;
    const spotlight = new Spotlight<number, fos.Sample>({
      key: 0,
      offset: 0,
      horizontal: true,
      scrollbar: true,
      spacing: strips.spacing,
      rowAspectRatioThreshold: () => 0,
      get: createPageGetter({
        aspectRatio: strips.aspectRatio,
        environment: strips.environment,
        limit: strips.limit,
        onPage: (page, items) => {
          items.forEach((item, i) =>
            records.set(item.id.description, recordBase + page * PAGE_SIZE + i),
          );
          page === 0 && setFirst({ count: items.length, for: variables });
        },
        pageSize: PAGE_SIZE,
        store: strips.store,
        variables,
      }),
      ...scopeRenderer<number, fos.Sample>(
        {
          detachItem: (id) => renderer.current.detachItem(id),
          hideItem: (item) => renderer.current.hideItem(item),
          showItem: (item) => renderer.current.showItem(item),
        },
        strips.ownership,
      ),
    });

    const unregister = strips.register(spotlight);
    spotlight.attach(element);
    const unroute = routeWheel(element, () => strips.root);

    return () => {
      unroute();
      unregister();
      spotlight.destroy();
    };
  }, [empty, height, near, recordBase, strips, variables]);

  return { count, host };
}
