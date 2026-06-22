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
  // per-looker update itself on attach (renders overlays + wires interactions)
  const itemUpdater = useItemUpdater(cache, lookerOptions);

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  // re-apply the per-looker update to every shown tile when active fields / coloring
  // change, so overlays show/hide with the sidebar checkboxes; skip the initial mount
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
        // scrolling fast — build nothing
        return 0;
      }

      // attach straight from cache; `showItem` never fetches. stays a wireframe until
      // the sample is hydrated, then re-runs when the hydrate bumps the version
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

  // Spotlight-independent attach for the InfiniteGrid: create-or-reuse a looker from
  // the cache and attach it to a tile; a no-op until the sample is hydrated
  const attachItem = useCallback(
    (id: ID, element: HTMLElement, dimensions: [number, number]) => {
      const key = id.description;
      // apply the looker's options + render overlays, passing the current coloring key
      // so only genuinely-new label fields hard-reload
      const update = () =>
        itemUpdater(
          getFontSize(),
          getColoringKey(lookerOptions.coloring, lookerOptions.colorscale)
        )(id);

      const cached = cache.get(key);
      if (cached) {
        // re-attach an already-rendered looker without re-running the update: a re-load
        // would postMessage an already-transferred mask buffer (DataCloneError)
        cached.attach(element, dimensions, getFontSize());
        cache.show(key);
        return;
      }

      const ss = store as unknown as WeakMap<ID, GridNode>;
      const result = ss.get(id);
      if (!result || isPlaceholder(result)) {
        // expected during scroll: stays a wireframe until its hydrate lands
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

  // release a tile's looker on recycle/unmount: detach from the DOM and hide it in the
  // bounded cache (the LRU destroys it only on eviction, so revisits reuse the instance)
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
