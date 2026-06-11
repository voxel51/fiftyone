import styles from "./Grid.module.css";

import { Button } from "@fiftyone/components";
import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import {
  gridAutosizing,
  gridCrop,
  gridPage,
  gridSpacing,
  maxGridItemsSizeBytes,
  pageParameters,
} from "./recoil";
import useEscape from "./useEscape";
import useEvents from "./useEvents";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import useScrollLocation from "./useScrollLocation";
import usePagination from "./usePagination";
import useSpotlightPager from "./useSpotlightPager";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

/**
 * Renders the sample grid with optional pagination and scroll state.
 */
function Grid() {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const config = useRecoilValue(fos.config);
  const [paginationEnabled, setPaginationEnabled] = useRecoilState(
    fos.appConfigOption({ modal: false, key: "gridPagination" })
  );
  const total = useRecoilValue(fos.datasetSampleCount);
  const [currentPage, setCurrentPage] = useRecoilState(gridPage);
  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);

  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    ...useLabelVisibility(),
  });

  const pageSizeFromConfig = config?.gridPageSize ?? 20;

  const { maxPage, safePage, start, end } = usePagination({
      paginationEnabled,
      setPaginationEnabled,
      currentPage,
      setCurrentPage,
      total,
      pageSize: pageSizeFromConfig,
    });

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    pagination: paginationEnabled,
    pageSize: paginationEnabled ? pageSizeFromConfig : undefined,
    records,
    zoomSelector: gridCrop,
  });

  const { getFontSize, lookerOptions, renderer } = useRenderer({
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
      get: (next) => (paginationEnabled ? page(safePage) : page(next)),
      onItemClick: setSample,
      rowAspectRatioThreshold: zoom,
    });
  }, [
    autosizing,
    cache,
    get,
    maxBytes,
    page,
    paginationEnabled,
    renderer,
    reset,
    resizing,
    safePage,
    setSample,
    spacing,
    zoom,
  ]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
      <div id={pixels} className={styles.fallingPixels} />
      {paginationEnabled ? (
        <div className={styles.paginationBar}>
          <Button
            color="secondary"
            onClick={async () => {
              const next = Math.max(0, safePage - 1);
              setCurrentPage(next);
              await page(next);
            }}
            disabled={safePage === 0}
          >
            Prev
          </Button>
          <div className={styles.paginationLabel}>
            {total === 0 ? "Showing 0 of 0" : `Showing ${start}–${end} of ${total}`}
          </div>
          <Button
            color="secondary"
            onClick={async () => {
              const next = Math.min(maxPage, safePage + 1);
              setCurrentPage(next);
              await page(next);
            }}
            disabled={safePage >= maxPage}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default React.memo(Grid);
