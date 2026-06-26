import styles from "./Grid.module.css";

import React from "react";
import { useRecoilValue } from "recoil";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import FixedGrid from "./FixedGrid";
import SpotlightGrid from "./SpotlightGrid";
import {
  gridAspectRatio,
  gridCrop,
  maxGridItemsSizeBytes,
  pageParameters,
  parseAspectRatio,
} from "./recoil";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useSpotlightPager from "./useSpotlightPager";

const MAX_INSTANCES = 200;

// The grid runs one of two engines, chosen by aspect-ratio mode, over shared resources:
// the spine (useSpotlightPager) is the single data layer, and the looker cache is the
// single instance pool. Both live here so switching AR mode keeps the loaded data AND
// reuses already-rendered lookers instead of rebuilding them. Fixed AR -> the
// deterministic engine (full-length scrollbar, deep random access); auto AR -> Spotlight.
function Grid() {
  const { pageReset, reset } = useRefreshers();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);
  const isAuto = parseAspectRatio(useRecoilValue(gridAspectRatio)) === null;

  const pager = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
  });

  // one looker-instance cache shared by both engines. divide by two: half for the
  // hidden cache, half for max shown. Identity is stable across renders (onSet/onDispose
  // are stable), so it survives an AR-mode switch and reuses rendered lookers.
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  const { onDispose, onSet } = useLabelVisibility();
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    onSet,
    onDispose,
  });

  return (
    <div className={styles.gridContainer}>
      {isAuto ? (
        <SpotlightGrid
          reset={reset}
          pageReset={pageReset}
          records={records}
          pager={pager}
          cache={cache}
        />
      ) : (
        <FixedGrid
          reset={reset}
          pageReset={pageReset}
          records={records}
          pager={pager}
          cache={cache}
        />
      )}
    </div>
  );
}

export default React.memo(Grid);
