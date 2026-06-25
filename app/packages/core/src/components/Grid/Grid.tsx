import styles from "./Grid.module.css";

import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import { gridCrop, maxGridItemsSizeBytes, pageParameters } from "./recoil";
import InfiniteGrid from "./InfiniteGrid";
import useEscape from "./useEscape";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager from "./useSpotlightPager";

const MAX_INSTANCES = 200;

function Grid() {
  const id = useMemoOne(() => uuid(), []);

  const { pageReset, reset } = useRefreshers();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  // both are stable (useCallback/useRecoilCallback with no deps), so the cache
  // identity below is preserved across renders.
  const { onDispose, onSet } = useLabelVisibility();
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    onSet,
    onDispose,
  });

  const { store, hydrateWindow, ensureSpineWindow, spineTotal } =
    useSpotlightPager({
      clearRecords: reset,
      pageSelector: pageParameters,
      records,
      zoomSelector: gridCrop,
    });

  const { attachItem, releaseItem } = useRenderer({
    cache,
    id,
    records,
    store,
  });
  useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);

  useEscape();

  return (
    <div className={styles.gridContainer}>
      <InfiniteGrid
        id={id}
        reset={reset}
        ensureSpineWindow={ensureSpineWindow}
        hydrateWindow={hydrateWindow}
        spineTotal={spineTotal}
        store={store}
        attachItem={attachItem}
        releaseItem={releaseItem}
        onItemClick={setSample}
      />
    </div>
  );
}

export default React.memo(Grid);
