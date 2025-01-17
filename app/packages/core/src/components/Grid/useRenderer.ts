import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
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

  const visible = useMemo(() => new Map<string, fos.Lookers>(), [])

  const hideItem = useCallback((id: ID) => {
    const looker = visible.get(id.description);
    if (!looker) {
      throw new Error("Error")
    }
    visible.delete(id.description)
    cache.set(id.description, looker)
  }, [cache, visible]);

  const showItem = useCallback(
    (
      id: ID,
      element: HTMLDivElement,
      dimensions: [number, number],
      zooming: boolean
    ): Promise<number> => {
      const cached = cache.get(id.description);
      if (cached) {
        cached?.attach(element, dimensions, getFontSize());
        return Promise.resolve(cached.getSizeBytesEstimate());
      }

      const result = store.get(id);

      if (!createLooker.current || !result) {
        throw new Error("bad data");
      }

      if (zooming) {
        // we are scrolling fast, skip creation
        return Promise.resolve(0);
      }

      const looker = createLooker.current?.(
        { ...result, symbol: id },
        {
          fontSize: getFontSize(),
        }
      );
      looker.addEventListener("selectthumbnail", ({ detail }) =>
        selectSample.current?.(detail)
      );
      cache.set(id.description, looker);
      looker.attach(element, dimensions);

      return new Promise((resolve) => {
        const listener = () => {
          resolve(looker.getSizeBytesEstimate());
          looker.removeEventListener("load", listener);
        };
        looker.addEventListener("load", listener);
      });
    },
    [cache, createLooker, getFontSize, selectSample, store, visible]
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
