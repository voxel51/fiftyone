import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import useFontSize from "./useFontSize";
import type useLookerCache from "./useLookerCache";
import useSelectSample from "./useSelectSample";
import type { SampleStore } from "./useSpotlightPager";




export default function ({
  cache,
  id,
  records,
  store,
}: {
  cache: ReturnType<typeof useLookerCache<fos.Lookers>>;
  id: string;
  records: Map<string, number>;
  store: SampleStore;
}) {
  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);
  const getFontSize = useFontSize(id);
  const selectSample = useSelectSample(records);


  const hideItem = useCallback((id: ID) => {
    cache.isShown(id.description) && cache.hide(id.description);
  }, [cache]);
  const showItem = useCallback(
    (
      id: ID,
      element: HTMLDivElement,
      dimensions: [number, number],
      zooming: boolean
    ): number | Promise<void> => {
      const key = id.description;
      if (cache.isShown(key)) {
        return cache.sizeOf(key);
      }

      const entry = cache.get(key);
      if (entry) {
        entry.instance.attach(element, dimensions, getFontSize());
        cache.show(key);
        return cache.sizeOf(key);
      }

      const result = store.get(id);

      if (!createLooker.current || !result) {
        throw new Error("bad data");
      }

      if (zooming) {
        // we are scrolling fast, skip creation
        return 0;
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
      cache.set(key, looker)
      looker.attach(element, dimensions);
      return cache.sizeOf(key)
    },
    [cache, createLooker, getFontSize, selectSample, store]
  );

  return {
    getFontSize,
    lookerOptions,
    renderer: {
      hideItem,
      showItem,
    },
  };
}
