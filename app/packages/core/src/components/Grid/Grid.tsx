import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import {
  useGridSelection,
  useLoadGridSelection,
  useSyncLegacySelection,
  useSyncSelectionScope,
} from "@fiftyone/state/src/selection";
import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import {
  gridAutosizing,
  gridCrop,
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
import SelectionTray from "./Selection/SelectionTray";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

function Grid() {
  useLoadGridSelection();
  useSyncLegacySelection();
  useSyncSelectionScope();
  const selection = useGridSelection();
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes) / 2;
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES,
    maxHiddenItemsSizeBytes: maxBytes,
    reset,
    ...useLabelVisibility(),
  });

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
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
  const { get, set } = useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);

  // `reset` is the grid's refresh signal. The callables below are routed
  // through a ref so their identities are not rebuild triggers — a transient
  // identity change from an unrelated state update must not destroy and
  // recreate the grid
  const refs = React.useRef({ get, page, renderer, setSample, selection });
  refs.current = { get, page, renderer, setSample, selection };

  const spotlight = useMemoOne(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    cache.freeze();

    return new Spotlight<number, fos.Sample>({
      ...refs.current.get(),

      detachItem: (item) => refs.current.renderer.detachItem(item),
      hideItem: (item) => refs.current.renderer.hideItem(item),
      showItem: (item) => refs.current.renderer.showItem(item),

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: autosizing ? maxBytes : undefined,
      scrollbar: true,
      spacing,

      get: (next) => refs.current.page(next),
      onItemClick: (item) => {
        if (
          refs.current.selection.enabled &&
          (item.event.ctrlKey || item.event.metaKey)
        ) {
          void refs.current.selection.toggle(item.item.id.description);
          return undefined;
        }
        return refs.current.setSample(item);
      },
      rowAspectRatioThreshold: zoom,
    });
  }, [cache, autosizing, maxBytes, reset, resizing, spacing, zoom]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div className={styles.gridViewport}>
        <div id={id} className={styles.spotlightGrid} data-cy="fo-grid" />
        <div id={pixels} className={styles.fallingPixels} />
      </div>
      {selection.enabled && <SelectionTray key={selection.domainId} />}
    </div>
  );
}

export default React.memo(Grid);
