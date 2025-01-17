import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import useFontSize from "./useFontSize";
import type useLookerCache from "./useLookerCache";
import useSelectSample from "./useSelectSample";
import type { SampleStore } from "./useSpotlightPager";


const resolveSize = (looker: fos.Lookers) => {
  if (looker.loaded) {
    return looker.getSizeBytesEstimate();
  }

  return new Promise<void>((resolve) => {
    const load = () => {
      looker.removeEventListener("load", load)
      resolve();
    }

    looker.addEventListener("load", load)
  })

}

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
    const instance = visible.get(id.description);
    if (!instance) {
      return;
    }
    visible.delete(id.description)
    cache.set(id.description, {dispose: true, instance});
  }, [cache, visible]);

  const showItem = useCallback(
    (
      id: ID,
      element: HTMLDivElement,
      dimensions: [number, number],
      zooming: boolean
    ): number | Promise<void> => {
      const shown = visible.get(id.description)
      if (shown) {
        return resolveSize(shown)
      }

      const entry = cache.get(id.description);
 
      if (entry) {
        entry.instance.attach(element, dimensions, getFontSize());
        cache.delete(id.description);
        return resolveSize(entry.instance);
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
      visible.set(id.description, looker)
      looker.attach(element, dimensions);

      return resolveSize(looker)
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
