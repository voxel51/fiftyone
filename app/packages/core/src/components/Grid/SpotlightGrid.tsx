import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import type { RowChange } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import {
  gridAutosizing,
  gridSpacing,
  gridSpineTotal,
  maxGridItemsSizeBytes,
} from "./recoil";
import useEscape from "./useEscape";
import useEvents from "./useEvents";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import type { Records } from "./useRecords";
import useResize from "./useResize";
import useScrollLocation from "./useScrollLocation";
import type useSpotlightPager from "./useSpotlightPager";
import useSpotlightRenderer from "./useSpotlightRenderer";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

// Auto-AR grid: the measured Spotlight engine, fed by the same spine data layer as
// the fixed-AR engine (its `get` pulls pages through the pager's spine-backed
// `page()`).
export default function SpotlightGrid({
  reset,
  pageReset,
  records,
  pager,
}: {
  reset: string;
  pageReset: string;
  records: Records;
  pager: ReturnType<typeof useSpotlightPager>;
}) {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

  const { page, store } = pager;

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    ...useLabelVisibility(),
  });

  const { getFontSize, lookerOptions, renderer } = useSpotlightRenderer({
    cache,
    id,
    records,
    store,
  });
  const { get, set } = useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);

  const spotlight = useMemoOne(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    cache.freeze();

    return new Spotlight<number, fos.Sample>({
      ...get(),
      ...renderer,

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: autosizing ? maxBytes : undefined,
      scrollbar: true,
      spacing,

      get: (next) => page(next),
      onItemClick: setSample,
      rowAspectRatioThreshold: zoom,
    });
  }, [
    cache,
    autosizing,
    get,
    maxBytes,
    page,
    renderer,
    reset,
    resizing,
    setSample,
    spacing,
    zoom,
  ]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  // total-count counter, matching the fixed-AR engine: the spine's resolved count
  // (groups for a dynamic-group view) once known, else the dataset estimate. Scroll
  // position tracks Spotlight's row changes through the shared records index.
  const [position, setPosition] = useState(0);
  const spineTotal = useRecoilValue(gridSpineTotal);
  const datasetCount = useRecoilValue(fos.datasetSampleCount) ?? 0;
  const total = spineTotal ?? datasetCount;
  useEffect(() => {
    if (!spotlight) return undefined;
    const onRow = (event: RowChange<number>) => {
      const index = records.get(event.at.description);
      if (typeof index === "number") setPosition(index + 1);
    };
    spotlight.addEventListener("rowchange", onRow);
    return () => spotlight.removeEventListener("rowchange", onRow);
  }, [spotlight, records]);

  return (
    <>
      <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
      <div id={pixels} className={styles.fallingPixels} />
      {total > 0 && (
        <div className={`${styles.scrollIndicator} ${styles.visible}`}>
          {Math.min(position, total).toLocaleString()} /{" "}
          {total.toLocaleString()}
        </div>
      )}
    </>
  );
}
