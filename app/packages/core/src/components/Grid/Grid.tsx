import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import {
  gridAutosizing,
  gridCrop,
  gridSpacing,
  maxGridItemsSizeBytes,
  pageParameters,
} from "./recoil";
import useAt from "./useAt";
import useEscape from "./useEscape";
import useEvents from "./useEvents";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import useSpotlightPager from "./useSpotlightPager";
import useThreshold from "./useThreshold";
import useUpdates from "./useUpdates";

const MAX_INSTANCES = 5151;
const MAX_ROWS = 5151;
const TWO = 2;

function Grid() {
  const id = useMemo(() => uuid(), []);
  const pixels = useMemo(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const threshold = useThreshold();

  const records = useRecords(pageReset);

  const maxBytes = useRecoilValue(maxGridItemsSizeBytes);
  const cache = useLookerCache(reset, MAX_INSTANCES, maxBytes);

  const { page, store } = useSpotlightPager({
    clearRecords: pageReset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
  });

  const { getFontSize, lookerOptions, renderer } = useRenderer({
    cache,
    id,
    records,
    store,
  });
  const { get, set } = useAt(pageReset);

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);

  const spotlight = useMemo(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    cache.hide();

    return new Spotlight<number, fos.Sample>({
      ...get(),
      ...renderer,

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: autosizing ? maxBytes : undefined,
      scrollbar: true,
      spacing,

      get: (next) => page(next),
      onItemClick: setSample,
      rowAspectRatioThreshold: threshold,
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
    threshold,
  ]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates(cache, getFontSize, lookerOptions, spotlight);
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
      <div id={pixels} className={styles.fallingPixels} />
    </div>
  );
}

export default React.memo(Grid);
