import type { Hide, ID, Show } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import { useGridRenderClaimsLooker } from "./useGridRenderClaimsLooker";
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
  const renderClaims = useGridRenderClaimsLooker(createLooker);

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

      if (!createLooker.current || !result) {
        throw new Error(
          `Failed to retrieve sample from store: ${id.description}`
        );
      }

      const looker = renderClaims.shouldOverrideRender({
        sample: result.sample,
      })
        ? renderClaims.createLookerWithPluginRenderer(
            { sample: result.sample },
            id,
            getFontSize()
          )
        : (createLooker.current?.(
            { ...result, symbol: id },
            { fontSize: getFontSize() }
          ) as fos.Lookers);

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
    [cache, createLooker, renderClaims, getFontSize, selectSample, store]
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
