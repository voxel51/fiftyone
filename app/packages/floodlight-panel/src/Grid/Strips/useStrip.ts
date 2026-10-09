/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Hosts one strip's short-lived horizontal Floodlight instances. A rebuild
 * (a new query, spacing, or cross extent) renders in a hidden slot and swaps
 * in at its `load`, handing lookers over, so the strip never blanks.
 */

import gridStyles from "../Grid.module.css";

import Spotlight from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { type RefObject, useContext, useEffect, useRef, useState } from "react";
import { SLOT } from "../../host/createHost";
import type { Scoped } from "../../host/ownership";
import useHost from "../../host/useHost";
import { createGridRenderer } from "../gridRenderer";
import { handOff } from "../handoff";
import { routeWheel } from "../samplePages";
import { StripsContext } from "./context";
import type { StripSource } from "./useStripSource";

// Mount a screen ahead so strips are populated before they scroll in.
const ROOT_MARGIN = "100% 100%";

export const useNearViewport = (
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

const shimmer = ({ element }: { element: HTMLDivElement }) => {
  element.classList.add(gridStyles.tileShimmer);
  return Promise.resolve(0);
};

/**
 * @param scrollbar - whether instances show their scrollbar; off when a rail
 *   replaces it
 * @returns the ref of the element the strip's instances render in, its host,
 *   and the instance on screen
 */
export default function useStrip(source: StripSource, scrollbar = true) {
  const strips = useContext(StripsContext);
  if (!strips) throw new Error("useStrip requires a StripsContext");

  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ scrollbar, source, strips });
  latest.current = { scrollbar, source, strips };
  const scopes = useRef(new WeakMap<object, Scoped<number, fos.Sample>>());
  const cleanups = useRef(new WeakMap<object, () => void>());
  const visible = useRef(false);

  const { host, instance } = useHost<number, Spotlight<number, fos.Sample>>({
    ref,
    axis: "height",
    build: (anchor, { interim }) => {
      const { scrollbar, source, strips } = latest.current;
      const scoped = createGridRenderer<fos.Sample>({
        base: () => latest.current.strips.renderer.current,
        cached: strips.hasItem,
        deferred: visible.current,
        interim,
        ownership: strips.ownership,
        reattach: true,
        shimmer,
        sizes: strips.lastSizes,
      });
      const spotlight = new Spotlight<number, fos.Sample>({
        key: anchor?.key ?? 0,
        at: anchor?.at,
        offset: 0,
        horizontal: true,
        scrollbar,
        spacing: strips.spacing,
        rowAspectRatioThreshold: () => 0,
        get: (page) => source.get(page),
        ...scoped,
      });
      scopes.current.set(spotlight, scoped);
      interim || cleanups.current.set(spotlight, strips.register(spotlight));
      return spotlight;
    },
    onSwap: (next, previous) => {
      visible.current = true;
      handOff({
        cache: latest.current.strips.cache,
        next: scopes.current.get(next),
        previous: previous && scopes.current.get(previous),
      });
    },
    onDispose: (disposed) => cleanups.current.get(disposed)?.(),
  });

  // a new query starts at the strip's beginning; anything else keeps its place
  const built = useRef<StripSource>();
  useEffect(() => {
    if (!host) return;
    const fresh = built.current !== source;
    built.current = source;
    host.rebuild(fresh ? { key: 0 } : undefined);
  }, [host, source, strips.spacing]);

  const { root } = strips;
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return routeWheel(
      element,
      () => root,
      () => element.querySelector(`:scope > [${SLOT}="active"] > *`),
    );
  }, [root]);

  return { host, instance, ref };
}
