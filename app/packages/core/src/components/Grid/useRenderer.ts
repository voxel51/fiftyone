import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";
import useSelectSample from "./useSelectSample";
import { useTileIntervalOverlay } from "./useTileIntervalOverlay";
import type { SampleStore } from "./useSpotlightPager";

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
  const tileOverlay = useTileIntervalOverlay();

  // `showItem` must stay stable even as the sample renderer hook refreshes.
  const sampleRendererRef = useRef(sampleRenderer);
  sampleRendererRef.current = sampleRenderer;

  const detachItem = useCallback(
    (id: ID) => {
      tileOverlay.unmount(id.description);
      return cache.get(id.description)?.detach();
    },
    [cache, tileOverlay],
  );

  const hideItem = useCallback<Hide>(
    ({ id }) => {
      tileOverlay.unmount(id.description);
      return cache.hide(id.description);
    },
    [cache, tileOverlay],
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
        const cached = store.get(id);
        if (cached) {
          tileOverlay.mount(key, element, cached);
        }
        cache.show(key);
        return cache.sizeOf(key);
      }

      if (zooming) {
        // we are scrolling fast, skip creation
        return Promise.resolve(0);
      }

      const result = store.get(id);

      if (!result) {
        throw new Error(
          `Failed to retrieve sample from store: ${id.description}`,
        );
      }

      const item = sampleRendererRef.current.createItem(
        result,
        id,
        getFontSize(),
      );

      item.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail),
      );
      item.addEventListener("refresh", () => {
        if (cache.isShown(key)) {
          spotlight.sizeChange(key, item.getSizeBytesEstimate());
        } else {
          cache.updateSize(key);
        }
      });

      cache.set(key, item);
      item.attach(element, dimensions);
      tileOverlay.mount(key, element, result);
      return cache.sizeOf(key);
    },
    [cache, getFontSize, selectSample, sampleRendererRef, store, tileOverlay],
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
      [detachItem, hideItem, showItem],
    ),
  };
}
