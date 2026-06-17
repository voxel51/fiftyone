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

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

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
