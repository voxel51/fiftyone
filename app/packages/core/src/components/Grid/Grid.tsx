import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import { gridCrop, gridSpacing, pageParameters } from "./recoil";
import useAt from "./useAt";
import useEscape from "./useEscape";
import useEvents from "./useEvents";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import useSelect from "./useSelect";
import useSpotlightPager from "./useSpotlightPager";
import useThreshold from "./useThreshold";

function Grid() {
  const id = useMemo(() => uuid(), []);
  const pixels = useMemo(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const { lookerCache, pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const { threshold, setMinimum } = useThreshold();

  const records = useRecords(pageReset);

  const { page, store } = useSpotlightPager({
    clearRecords: pageReset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
  });

  const { getFontSize, lookerOptions, renderer } = useRenderer({
    cache: lookerCache,
    id,
    records,
    store,
  });
  const { get, set } = useAt(pageReset);

  const setSample = fos.useExpandSample(store);

  const spotlight = useMemo(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    return new Spotlight<number, fos.Sample>({
      ...get(),
      ...renderer,

      maxItemsSizeBytes: 5e8,
      scrollbar: true,
      spacing,

      get: (next) => page(next),
      onItemClick: setSample,
      rowAspectRatioThreshold: threshold,
    });
  }, [get, page, renderer, reset, resizing, setSample, spacing, threshold]);

  useEscape();
  useEvents({ id, lookerCache, pixels, resizing, set, setMinimum, spotlight });
  useSelect(getFontSize, lookerOptions, lookerCache, spotlight);
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
      <div id={pixels} className={styles.fallingPixels} />
    </div>
  );
}

export default React.memo(Grid);
