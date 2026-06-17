import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";
import useSelectSample from "./useSelectSample";
import {
  type GridNode,
  isPlaceholder,
  type SampleStore,
} from "./useSpotlightPager";

export default function useRenderer({
  cache,
  hydrateWindow,
  id,
  records,
  store,
}: {
  cache: LookerCache;
  hydrateWindow: (ids: ReadonlyArray<string>) => Promise<Map<string, GridNode>>;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
}) {
  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getFontSize = useFontSize(id);
  const selectSample = useSelectSample(records);
  const sampleRenderer = useGridCustomRendererItem(createLooker);

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  // Tiles whose looker is mid-build (async hydrate not yet cached). The grid calls
  // `showItem` every render frame; without this guard a slow hydrate spawns one
  // looker per frame (orphaned, never detached).
  const creating = useRef(new Set<string>());

  const detachItem = useCallback(
    (id: ID) => cache.get(id.description)?.detach(),
    [cache]
  );

  const hideItem = useCallback<Hide>(
    ({ id }) => cache.hide(id.description),
    [cache]
  );

  const showItem = useCallback<Show<number, fos.Sample>>(
    async ({ id, element, dimensions, spotlight, zooming }) => {
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
        // scrolling fast — create + fetch NOTHING; the tile stays a placeholder.
        return 0;
      }

      // Build a tile's looker exactly once: skip if a prior (async) showItem is
      // still hydrating it — a re-show mounts it from cache once ready.
      if (creating.current.has(key)) {
        return 0;
      }
      creating.current.add(key);

      // Settled: hydrate this tile before building the looker (which needs the
      // signed media url). hydrateWindow coalesces every settled-window tile into
      // ONE batched read, never per-sample.
      const ss = store as unknown as WeakMap<ID, GridNode>;
      let result = ss.get(id);
      if (isPlaceholder(result)) {
        const node = (await hydrateWindow([key])).get(key);
        if (node) {
          ss.set(id, node);
          result = node;
        }
      }
      if (isPlaceholder(result)) {
        // still unhydrated (scrolled away before the batch landed) — keep placeholder.
        creating.current.delete(key);
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
      creating.current.delete(key);
      item.attach(element, dimensions);
      return cache.sizeOf(key);
    },
    [cache, getFontSize, hydrateWindow, selectSample, store]
  );

  return {
    getFontSize,
    lookerOptions,
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
