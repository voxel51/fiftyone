import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import type { LookerCache } from "./types";
import useFontSize from "./useFontSize";
import useSelectSample from "./useSelectSample";
import type { SampleStore } from "./useSpotlightPager";

export default function ({
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

  const detachItem = useCallback(
    (id: ID) => cache.get(id.description)?.detach(),
    [cache]
  );

  const hideItem = useCallback((id: ID) => cache.hide(id.description), [cache]);

  const showItem = useCallback(
    (
      id: ID,
      element: HTMLDivElement,
      dimensions: [number, number],
      zooming: boolean
    ): number | Promise<number> => {
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
        return 0;
      }

      const result = store.get(id);

      if (!createLooker.current || !result) {
        throw new Error("bad data");
      }

      const looker: fos.Lookers = createLooker.current?.(
        { ...result, symbol: id },
        {
          fontSize: getFontSize(),
        }
      );
      looker.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail)
      );
      cache.set(key, looker);
      looker.attach(element, dimensions);
      return cache.sizeOf(key);
    },
    [cache, createLooker, getFontSize, selectSample, store]
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
