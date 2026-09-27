import styles from "./Grid.module.css";
import type { Hide, ID, Show } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import type { ItemCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridCustomRendererItem } from "./useGridCustomRendererItem";
import useSelectSample from "./useSelectSample";
import type { SampleStore } from "./useSpotlightPager";

type Loadable = {
  loaded: boolean;
  addEventListener(type: "load", listener: () => void): void;
};

// the tile shimmers until its media and overlays have drawn
const shimmerUntilLoaded = (item: Loadable, element: HTMLElement) => {
  if (item.loaded) return;
  element.classList.add(styles.tileShimmer);
  item.addEventListener("load", () =>
    element.classList.remove(styles.tileShimmer),
  );
};

export default function useRenderer({
  cache,
  id,
  records,
  store,
}: {
  cache: ItemCache;
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
    (id: ID) => {
      cache.get(id.description)?.detach();
      cache.hide(id.description);
    },
    [cache],
  );

  const hideItem = useCallback<Hide>(
    ({ id }) => cache.hide(id.description),
    [cache],
  );

  const showItem = useCallback<Show<number, fos.Sample>>(
    ({ id, element, dimensions, spotlight, zooming }) => {
      const key = id.description;

      if (cache.isShown(key)) {
        return cache.sizeOf(key);
      }

      const instance = cache.get(key);
      if (instance) {
        shimmerUntilLoaded(instance, element);
        instance.attach(element, dimensions, getFontSize());
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
      shimmerUntilLoaded(item, element);
      item.attach(element, dimensions);
      return cache.sizeOf(key);
    },
    [cache, getFontSize, selectSample, sampleRendererRef, store],
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
