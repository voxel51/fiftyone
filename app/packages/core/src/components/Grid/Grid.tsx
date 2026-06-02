import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "../../hooks";
import GridScrubber from "./GridScrubber";
import {
  gridAutosizing,
  gridCrop,
  gridSpacing,
  gridZoom,
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
import useSwimlaneRenderer from "./useSwimlaneRenderer";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

function Grid() {
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

  // Swimlanes mode: the renderer wraps each Spotlight row in
  // `[ cover | divider | siblings ]` (see `useSwimlaneRenderer`), and
  // the row's aspect ratio is overridden uniformly so every row is
  // the same height regardless of the underlying image's native
  // ratio. The zoom slider repurposes as a row-height control —
  // `-1` (right of slider) ≈ square row, `-15` (left) ≈ very short.
  const [swimlanesEnabled] = fos.useGridSwimlanes();
  const swimlanesAvailable = fos.useGridSwimlanesAvailable();
  const useSwimlanes = swimlanesEnabled && swimlanesAvailable;
  const zoomValue = useRecoilValue(gridZoom);
  const swimlaneAspect = useSwimlanes
    ? Math.max(1, -(zoomValue ?? -3))
    : undefined;

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
    aspectRatioOverride: swimlaneAspect,
  });

  const standardRenderer = useRenderer({ cache, id, records, store });
  const swimlaneRenderer = useSwimlaneRenderer({
    cache,
    id,
    records,
    store,
  });
  const { getFontSize, lookerOptions, renderer } = useSwimlanes
    ? swimlaneRenderer
    : standardRenderer;
  const { get, set } = useScrollLocation(pageReset);

  const setSample = fos.useExpandSample(store);
  const autosizing = useRecoilValue(gridAutosizing);
  // When the scrubber is on it owns the grid's right edge; turn off
  // Spotlight's built-in scrollbar so the two don't fight for the gutter.
  const [scrubberEnabled] = fos.useGridScrubber();

  const spotlight = useMemoOne(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    cache.freeze();

    // `spotlight` is captured by `onItemClick` so the click handler can
    // mint a fresh navigation iterator via `spotlight.createIter()`. The
    // closure is evaluated only when the user clicks, so by that time
    // `spotlight` is fully constructed.
    const spotlight = new Spotlight<number, fos.Sample>({
      ...get(),
      ...renderer,

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: autosizing ? maxBytes : undefined,
      scrollbar: !scrubberEnabled,
      // No vertical gap between swimlane rows — rows abut each other
      // so the view reads as a continuous stack. Standard grid mode
      // still uses the user's spacing setting.
      spacing: useSwimlanes ? 0 : spacing,
      // Use Spotlight's DEFAULT_OFFSET (48px) so the first row sits
      // below the transparent header. The header is rendered as an
      // absolute overlay with a gradient that fades over the grid's
      // top edge; without the offset, the first row collides with
      // the chrome and is hard to read through the gradient.
      get: (next) => page(next),
      onItemClick: (args) => setSample(args, () => spotlight.createIter()),
      // Swimlane mode: force one item per row so each grid row
      // becomes one swimlane (cover + divider + siblings strip).
      // Threshold 0 always breaks the row at every item; default
      // `zoom` tiles per the aspect-ratio budget.
      rowAspectRatioThreshold: useSwimlanes ? () => 0 : zoom,
    });
    return spotlight;
  }, [
    cache,
    autosizing,
    get,
    maxBytes,
    page,
    renderer,
    reset,
    resizing,
    scrubberEnabled,
    setSample,
    spacing,
    useSwimlanes,
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
      <GridScrubber />
    </div>
  );
}

export default React.memo(Grid);
