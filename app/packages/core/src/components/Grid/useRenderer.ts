import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridSampleRendererItem } from "./useGridSampleRendererItem";
import useSelectSample from "./useSelectSample";
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
  const sampleRenderer = useGridSampleRendererItem(createLooker);

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
        // we are scrolling fast, skip creation
        return Promise.resolve(0);
      }

      const result = store.get(id);

      if (!result) {
        throw new Error(
          `Failed to retrieve sample from store: ${id.description}`
        );
      }

      const looker = sampleRendererRef.current.createItem(
        result,
        id,
        getFontSize()
      );

      looker.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail)
      );
      looker.addEventListener("refresh", () => {
        cache.isShown(key) &&
          spotlight.sizeChange(key, looker.getSizeBytesEstimate());
      });

      cache.set(key, looker);
      looker.attach(element, dimensions);
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
