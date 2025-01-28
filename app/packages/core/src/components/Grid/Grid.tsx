import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import {
  gridCrop,
  gridSpacing,
  interevenedGridZoom,
  pageParameters,
} from "./recoil";
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

const MAX_ROWS = 5151;
// @ts-ignore
const MAX_SHOWN_SIZE_BYTES = ((navigator.deviceMemory ?? 8) / 16) * 1e9;

function Grid() {
  const id = useMemo(() => uuid(), []);
  const pixels = useMemo(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const { lookerCache, pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const threshold = useThreshold();

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
  const disableSizing = !!useRecoilValue(interevenedGridZoom);

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

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: disableSizing ? undefined : MAX_SHOWN_SIZE_BYTES,
      scrollbar: true,
      spacing,

      get: (next) => page(next),
      onItemClick: setSample,
      rowAspectRatioThreshold: threshold,
    });
  }, [
    disableSizing,
    get,
    page,
    renderer,
    reset,
    resizing,
    setSample,
    spacing,
    threshold,
  ]);

  useEscape();
  useEvents({ id, lookerCache, pixels, resizing, set, spotlight });
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
