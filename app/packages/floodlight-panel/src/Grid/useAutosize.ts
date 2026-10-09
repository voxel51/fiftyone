import type { ID, ItemData } from "@fiftyone/floodlight";
import { useSetReverbState } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { MANAGING_GRID_MEMORY } from "@fiftyone/utilities";
import { type RefObject, useCallback } from "react";
import { recommendedGridZoom } from "./atoms";
import { estimateBytes, estimateRowAspect } from "./estimate";
import type { ItemCache } from "./types";
import type { SampleStore } from "./useSpotlightPager";

/** Zooms the grid in to `zoom`, remembered for the dataset, and says why. */
export const useRecommendZoom = () => {
  const snackbar = useSetReverbState(fos.snackbarLink);
  const setRecommendedZoom = useSetReverbState(recommendedGridZoom);
  return useCallback(
    (zoom: number) => {
      setRecommendedZoom(zoom);
      snackbar({
        link: MANAGING_GRID_MEMORY,
        message: "That's a lot of data! We've zoomed in a bit",
      });
    },
    [setRecommendedZoom, snackbar],
  );
};

/**
 * Auto-sizing for content builds. `start` picks the row aspect ratio a build
 * starts at from its first page's sample metadata, recommending it when it is
 * narrower than the zoom's; the instance's measured sizes then validate it.
 * `size` is what a deferred show reports: the cached looker's size, else the
 * sample's estimate.
 */
export default function useAutosize({
  budget,
  cache,
  container,
  store,
  zoom,
}: {
  budget: number;
  cache: ItemCache;
  container: RefObject<HTMLElement>;
  store: SampleStore;
  zoom: (width: number) => number;
}) {
  const recommend = useRecommendZoom();

  const start = (items: ItemData<number, fos.Sample>[]) => {
    const width = container.current?.clientWidth ?? 0;
    const rowAspect = zoom(width);
    const fits = estimateRowAspect({
      budget,
      height: container.current?.clientHeight ?? 0,
      items: items.map(({ aspectRatio, data }) => ({
        aspectRatio,
        bytes: estimateBytes(data.sample),
      })),
      rowAspect,
      width,
    });
    fits < rowAspect && recommend(-fits);
    return fits;
  };

  const size = ({ id }: { id: ID }) =>
    cache.get(id.description)
      ? cache.sizeOf(id.description)
      : Promise.resolve(estimateBytes(store.get(id)?.sample) ?? 0);

  return { recommend, size, start };
}
