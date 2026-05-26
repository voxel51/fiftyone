import styles from "./Grid.module.css";

import { Button } from "@fiftyone/components";
import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useEffect, useState } from "react";
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
import useSpotlightPager from "./useSpotlightPager";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;
const GRID_PAGE_PARAM = "page";

const getPageFromSearch = (search: string) => {
  const value = new URLSearchParams(search).get(GRID_PAGE_PARAM);
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page - 1 : 0;
};

const setPageInLocation = (page: number) => {
  const searchParams = new URLSearchParams(window.location.search);

  if (page > 0) {
    searchParams.set(GRID_PAGE_PARAM, String(page + 1));
  } else {
    searchParams.delete(GRID_PAGE_PARAM);
  }

  const search = searchParams.toString();
  const nextUrl = `${window.location.pathname}${
    search.length ? `?${search}` : ""
  }${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.pushState(window.history.state, "", nextUrl);
  }
};

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

  const handlePaginationToggle = () => {
    const nextEnabled = !paginationEnabled;

    setPaginationEnabled(nextEnabled);
    setCurrentPage(0);

    if (typeof window !== "undefined") {
      setPageInLocation(0);
    }
  };

  useEffect(() => {
    if (!paginationEnabled || typeof window === "undefined") {
      return undefined;
    }

    const syncPageFromUrl = () => {
      setCurrentPage(getPageFromSearch(window.location.search));
    };

    syncPageFromUrl();
    window.addEventListener("popstate", syncPageFromUrl);

    return () => {
      window.removeEventListener("popstate", syncPageFromUrl);
    };
  }, [paginationEnabled, setCurrentPage]);

  useEffect(() => {
    if (!paginationEnabled || typeof window === "undefined") {
      return undefined;
    }

    setPageInLocation(currentPage);
  }, [paginationEnabled, currentPage]);

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    pagination: paginationEnabled,
    pageSize: pageSizeFromConfig,
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
      get: (next) => (paginationEnabled ? page(currentPage) : page(next)),
      onItemClick: setSample,
      rowAspectRatioThreshold: zoom,
    });
  }, [
    autosizing,
    cache,
    currentPage,
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

  const maxPage = Math.max(0, Math.ceil(total / pageSizeFromConfig) - 1);
  const start = total === 0 ? 0 : currentPage * pageSizeFromConfig + 1;
  const end = total === 0 ? 0 : Math.min((currentPage + 1) * pageSizeFromConfig, total);

  return (
    <div className={styles.gridContainer}>
      <div className={styles.paginationToggle}>
        <Button color="secondary" onClick={handlePaginationToggle}>
          {paginationEnabled ? "Disable pagination" : "Enable pagination"}
        </Button>
      </div>
      <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
      <div id={pixels} className={styles.fallingPixels} />
      {paginationEnabled ? (
        <div className={styles.paginationBar}>
          <Button
            color="secondary"
            onClick={async () => {
              const next = Math.max(0, currentPage - 1);
              setCurrentPage(next);
              await page(next);
            }}
            disabled={currentPage === 0}
          >
            Prev
          </Button>
          <div className={styles.paginationLabel}>
            {total === 0 ? "Showing 0 of 0" : `Showing ${start}–${end} of ${total}`}
          </div>
          <Button
            color="secondary"
            onClick={async () => {
              const next = Math.min(maxPage, currentPage + 1);
              setCurrentPage(next);
              await page(next);
            }}
            disabled={currentPage >= maxPage}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default React.memo(Grid);
