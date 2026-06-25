import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
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

// the looker instance the cache stores (non-undefined return of `cache.get`)
type CacheItem = NonNullable<ReturnType<LookerCache["get"]>>;

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
  // the InfiniteGrid has no Spotlight engine, so it applies the per-looker update
  // itself on attach.
  const itemUpdater = useItemUpdater(cache, lookerOptions);

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  // re-apply the per-looker update on field/coloring change (Spotlight's `useUpdates`
  // does this; the InfiniteGrid has no engine). Skip the initial mount — `attachItem`
  // already applies it on create.
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

  // Create-or-reuse a tile's looker. Reuse re-attaches only — re-running the update
  // would postMessage an already-transferred mask buffer → DataCloneError → overlays
  // vanish. A no-op until the sample hydrates. `onCreate` runs once, only for a freshly
  // built looker.
  const mountOrReuse = useCallback(
    (
      id: ID,
      element: HTMLElement,
      dimensions: [number, number],
      opts?: { onCreate?: (item: CacheItem) => void }
    ): CacheItem | null => {
      const key = id.description;

      const cached = cache.get(key);
      if (cached) {
        cached.attach(element, dimensions, getFontSize());
        cache.show(key);
        return cached;
      }

      const ss = store as unknown as WeakMap<ID, GridNode>;
      const result = ss.get(id);
      if (!result || isPlaceholder(result)) {
        return null;
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
      opts?.onCreate?.(item);
      return item;
    },
    [cache, getFontSize, selectSample, store]
  );

  // Attach a tile's looker, then apply the per-looker update on a fresh build.
  const attachItem = useCallback(
    (id: ID, element: HTMLElement, dimensions: [number, number]) => {
      mountOrReuse(id, element, dimensions, {
        onCreate: () =>
          itemUpdater(
            getFontSize(),
            getColoringKey(lookerOptions.coloring, lookerOptions.colorscale)
          )(id),
      });
    },
    [mountOrReuse, itemUpdater, getFontSize, lookerOptions]
  );

  // release a tile's looker on recycle/unmount: detach (so it blanks immediately) and
  // hide in the cache (the LRU destroys it only on eviction, so revisits reuse it).
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
  };
}
