import styles from "./Grid.module.css";

import React from "react";
import { useRecoilValue } from "recoil";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import FixedGrid from "./FixedGrid";
import SpotlightGrid from "./SpotlightGrid";
import { gridAspectRatio, gridCrop, pageParameters, parseAspectRatio } from "./recoil";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useSpotlightPager from "./useSpotlightPager";

// The grid runs one of two engines, chosen by aspect-ratio mode, over a single shared
// data layer (the spine in useSpotlightPager): fixed AR -> the deterministic engine
// (full-length scrollbar, deep random access); auto AR -> the measured Spotlight
// engine. Both read/write the same id spine + sample store, so switching mode keeps
// the loaded data.
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

  return (
    <div className={styles.gridContainer}>
      {isAuto ? (
        <SpotlightGrid
          reset={reset}
          pageReset={pageReset}
          records={records}
          pager={pager}
        />
      ) : (
        <FixedGrid
          reset={reset}
          pageReset={pageReset}
          records={records}
          pager={pager}
        />
      )}
    </div>
  );
}

export default React.memo(Grid);
