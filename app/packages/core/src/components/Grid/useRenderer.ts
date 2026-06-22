import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";
import useSelectSample from "./useSelectSample";
import { getColoringKey, useItemUpdater } from "./useUpdates";
import {
  type GridNode,
  isPlaceholder,
  type SampleStore,
} from "./useSpotlightPager";

export default function useRenderer({
  cache,
  id,
  records,
  store,
}: {
  cache: LookerCache;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
}) {
  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getFontSize = useFontSize(id);
  const selectSample = useSelectSample(records);
  const sampleRenderer = useGridCustomRendererItem(createLooker);
  // the InfiniteGrid has no Spotlight engine driving `useUpdates`, so it applies the
  // SAME per-looker update itself on attach (renders overlays + wires interactions).
  const itemUpdater = useItemUpdater(cache, lookerOptions);

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  // Spotlight's `useUpdates` re-applied the per-looker update to every tile via
  // `updateItems` whenever active fields / coloring changed; the InfiniteGrid has no
  // engine, so it must drive that refresh itself — otherwise overlays don't show/hide
  // with the sidebar checkboxes. Skip the initial mount (each tile's `attachItem`
  // already applies the update on create).
  const optionsRef = useRef(lookerOptions);
  optionsRef.current = lookerOptions;
  const lastColoringKeyRef = useRef(
    getColoringKey(lookerOptions.coloring, lookerOptions.colorscale)
  );
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const update = itemUpdater(getFontSize(), lastColoringKeyRef.current);
    for (const key of [...cache.shown.keys()]) {
      update({ description: key } as unknown as ID);
    }
    lastColoringKeyRef.current = getColoringKey(
      optionsRef.current.coloring,
      optionsRef.current.colorscale
    );
  }, [cache, getFontSize, itemUpdater]);

  const detachItem = useCallback(
    (id: ID) => cache.get(id.description)?.detach(),
    [cache]
  );

  const hideItem = useCallback<Hide>(
    ({ id }) => cache.hide(id.description),
    [cache]
  );

  const showItem = useCallback<Show<number, fos.Sample>>(
    ({ id, element, dimensions, spotlight, zooming }) => {
      const key = id.description;

      if (cache.isShown(key)) {
        return cache.sizeOf(key);
      }

      const instance = cache.get(key);
      if (instance) {
        instance.attach(element, dimensions, getFontSize());
        cache.show(key);
        return cache.sizeOf(key);
      }

      if (zooming) {
        // scrolling fast — build nothing.
        return 0;
      }

      // Attach straight from cache — `showItem` NEVER fetches; the in-view loader
      // writes the store and bumps a version that re-runs this. If the sample
      // isn't loaded yet (between the spine publish and the hydrate landing), stay
      // a wireframe and we'll be re-called when the hydrate bump arrives.
      const ss = store as unknown as WeakMap<ID, GridNode>;
      const result = ss.get(id);
      if (!result || isPlaceholder(result)) {
        return 0;
      }

      const item = sampleRendererRef.current.createItem(
        result as unknown as Parameters<
          typeof sampleRendererRef.current.createItem
        >[0],
        id,
        getFontSize()
      );

      item.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail)
      );
      item.addEventListener("refresh", () => {
        cache.isShown(key) &&
          spotlight.sizeChange(key, item.getSizeBytesEstimate());
      });

      cache.set(key, item);
      item.attach(element, dimensions);
      return cache.sizeOf(key);
    },
    [cache, getFontSize, selectSample, store]
  );

  // Spotlight-independent attach used by the InfiniteGrid: create-or-reuse a looker
  // from the SAME cache and attach it to a tile element. A no-op until the sample is
  // hydrated (the tile stays a wireframe and is re-called when the hydrate lands), so
  // it never blocks — the looker then loads its media + renders overlays async.
  const attachItem = useCallback(
    (id: ID, element: HTMLElement, dimensions: [number, number]) => {
      const key = id.description;
      // apply the looker's options + render its overlays / wire interactions, exactly
      // as Spotlight's `useUpdates` does — passing the CURRENT coloring key so only
      // genuinely-new label fields hard-reload (re-rasterize).
      const update = () =>
        itemUpdater(
          getFontSize(),
          getColoringKey(lookerOptions.coloring, lookerOptions.colorscale)
        )(id);

      const cached = cache.get(key);
      if (cached) {
        // Re-attach an already-rendered looker WITHOUT re-running the update: its
        // overlays are already painted, and a re-load would `postMessage` a mask
        // buffer that was already transferred (detached) → DataCloneError → the
        // looker retries without the buffer → overlays vanish on scroll.
        cached.attach(element, dimensions, getFontSize());
        cache.show(key);
        return;
      }

      const ss = store as unknown as WeakMap<ID, GridNode>;
      const result = ss.get(id);
      if (!result || isPlaceholder(result)) {
        // expected during scroll: stays a wireframe until its hydrate lands.
        return;
      }

      const item = sampleRendererRef.current.createItem(
        result as unknown as Parameters<
          typeof sampleRendererRef.current.createItem
        >[0],
        id,
        getFontSize()
      );
      item.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail)
      );
      cache.set(key, item);
      item.attach(element, dimensions);
      update();
    },
    [cache, getFontSize, selectSample, store, itemUpdater, lookerOptions]
  );

  // release a tile's looker on recycle/unmount: detach its element from the DOM (so a
  // recycled tile blanks immediately instead of showing the previous sample) and hide
  // it in the bounded cache (the LRU destroys it only when evicted, so revisiting a
  // row reuses the already-rendered instance).
  const releaseItem = useCallback(
    (id: ID) => {
      const key = id.description;
      cache.get(key)?.detach();
      cache.hide(key);
    },
    [cache]
  );

  return {
    getFontSize,
    lookerOptions,
    attachItem,
    releaseItem,
    renderer: useMemo(
      () => ({
        detachItem,
        hideItem,
        showItem,
      }),
      [detachItem, hideItem, showItem]
    ),
  };
}
