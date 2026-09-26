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
import useGridJump from "./useGridJump";
import useGridSelectionClick from "./useGridSelectionClick";
import { useBucketTileDecorator } from "./Selection/bucketTileDecorator";
import useTileHover from "./useTileHover";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import TileDecoratorPortals from "./TileDecoratorPortals";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager from "./useSpotlightPager";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";
import SelectionTray from "./Selection/SelectionTray";
import { useSavedSegmentTileDecorator } from "./Selection/savedSegmentTileDecorator";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

function Grid() {
  useLoadGridSelection();
  useSyncLegacySelection();
  useSyncSelectionScope();
  const selection = useGridSelection();
  useSavedSegmentTileDecorator(
    Boolean(
      selection.request.boundary.subsetId &&
      selection.request.boundary.subsetScope === "segments" &&
      !selection.conversion,
    ),
  );
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

  const selectBucket = useGridSelectionClick({ records, selection, page });
  useBucketTileDecorator(selection.enabled && selection.buckets.length > 1, {
    datasetId: selection.datasetId,
    domainId: selection.domainId,
    unit: selection.unit,
    select: selectBucket,
  });
  const { getFontSize, lookerOptions, renderer } = useRenderer({
    cache,
    id,
    records,
    store,
    selectBucket,
  });
  const { get, set, jump: anchor } = useScrollLocation(pageReset);
  const jump = useGridJump({
    records,
    datasetId: selection.datasetId,
    request: selection.request,
    anchor,
  });

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);

  // `reset` is the grid's refresh signal. The callables below are routed
  // through a ref so their identities are not rebuild triggers — a transient
  // identity change from an unrelated state update must not destroy and
  // recreate the grid
  const refs = React.useRef({
    get,
    page,
    renderer,
    setSample,
    selection,
    selectBucket,
  });
  refs.current = { get, page, renderer, setSample, selection, selectBucket };

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
        const { selection } = refs.current;
        const { ctrlKey, metaKey, altKey, shiftKey } = item.event;
        // Command/Ctrl-click toggles the tile in its routed bucket (the
        // second when one exists, else the first). Option/Alt-click toggles
        // the third bucket, and without one stays what it always was: a
        // plain open. Shift adds a range in that same bucket.
        if (selection.enabled && (ctrlKey || metaKey || altKey || shiftKey)) {
          const bucket = selection.route(item.event);
          if (
            shiftKey ||
            ctrlKey ||
            metaKey ||
            bucket !== selection.buckets[0]
          ) {
            void refs.current.selectBucket(
              item.item.id.description,
              bucket.id,
              shiftKey,
            );
            return undefined;
          }
        }
        return shiftKey ? undefined : refs.current.setSample(item);
      },
      rowAspectRatioThreshold: zoom,
    });
  }, [cache, autosizing, maxBytes, reset, resizing, spacing, zoom]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useTileHover(id);
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div className={styles.gridViewport}>
        <div
          id={id}
          className={styles.spotlightGrid}
          data-cy="fo-grid"
          data-selection-buckets={
            selection.enabled && selection.buckets.length > 1 ? true : undefined
          }
        />
        <div id={pixels} className={styles.fallingPixels} />
        {/* Renders per-tile decorators (status badges, etc.) as portals
            into the overlay div reserved by `useRenderer.showItem`.
            Lives outside the Spotlight host so Spotlight's own DOM
            churn never touches React-managed tree. */}
        <TileDecoratorPortals />
      </div>
      {selection.enabled && (
        <SelectionTray key={selection.domainId} locate={jump} />
      )}
    </div>
  );
}

export default React.memo(Grid);
