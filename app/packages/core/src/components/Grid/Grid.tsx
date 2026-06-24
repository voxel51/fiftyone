import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import {
  gridAspectRatio,
  gridAutosizing,
  gridCrop,
  gridEngineAuto,
  gridSpacing,
  maxGridItemsSizeBytes,
  pageParameters,
  parseAspectRatio,
} from "./recoil";
import InfiniteGrid from "./InfiniteGrid";
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

function Grid() {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);

  // A fixed tile aspect ratio always uses the virtualized infinite grid. "auto"
  // (parses to null) keeps the justified Spotlight grid unless the engine flag opts
  // in (Phase 2 A/B: justified-from-spine vs Spotlight, before Spotlight is retired).
  // call both hooks unconditionally (no short-circuit) — `||` would skip the
  // second hook in fixed mode and break the Rules of Hooks on toggle
  const fixedAspectRatio =
    parseAspectRatio(useRecoilValue(gridAspectRatio)) !== null;
  const engineAuto = useRecoilValue(gridEngineAuto);
  const useInfiniteGrid = fixedAspectRatio || engineAuto;
  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

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

  const { page, store, hydrateWindow, ensureSpineWindow, spineTotal } =
    useSpotlightPager({
      clearRecords: reset,
      pageSelector: pageParameters,
      records,
      zoomSelector: gridCrop,
    });

  const { getFontSize, lookerOptions, renderer, attachItem, releaseItem } =
    useRenderer({
      cache,
      id,
      records,
      store,
    });
  const { get, set } = useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);

  const spotlight = useMemoOne(() => {
    reset;

    if (useInfiniteGrid || resizing) {
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
    useInfiniteGrid,
    zoom,
  ]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      {useInfiniteGrid ? (
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
      ) : (
        <>
          <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
          <div id={pixels} className={styles.fallingPixels} />
        </>
      )}
    </div>
  );
}

export default React.memo(Grid);
