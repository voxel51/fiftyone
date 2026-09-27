import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import clsx from "clsx";
import React, { useState } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "@fiftyone/core/src/hooks";
import GridScrubber from "./GridScrubber";
import {
  gridAutosizing,
  gridSquareTiles,
  gridCrop,
  gridSpacing,
  gridZoom,
  maxGridItemsSizeBytes,
  pageParameters,
} from "./atoms";
import useEscape from "./useEscape";
import useEvents from "./useEvents";
import useItemCache from "./useItemCache";
import useLabelVisibility from "./useLabelVisibility";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager from "./useSpotlightPager";
import Storm from "./Storm";
import useSwimlaneRenderer from "./useSwimlaneRenderer";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES = 200;
const MAX_ROWS = 200;

function Grid({ layout }: { layout: "grid" | "groups" | "strip" }) {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useReverbValue(gridSpacing);

  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

  useSyncLabelsRenderingStatus();

  const records = useRecords(pageReset);

  // divide by two, half for the hidden cache and half for max shown
  const maxBytes = useReverbValue(maxGridItemsSizeBytes) / 2;
  const cache = useItemCache({
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
  const useSwimlanes = layout === "groups";
  const strip = layout === "strip";
  const zoomValue = useReverbValue(gridZoom);
  const squareTiles = useReverbValue(gridSquareTiles);
  const swimlaneAspect = useSwimlanes
    ? Math.max(1, -(zoomValue ?? -3))
    : undefined;

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
    aspectRatioOverride: swimlaneAspect ?? (squareTiles ? 1 : undefined),
  });

  const standardRenderer = useRenderer({ cache, id, records, store });
  const swimlaneRenderer = useSwimlaneRenderer({
    cache,
    id,
    records,
    store,
  });
  const { getFontSize, lookerOptions } = useSwimlanes
    ? swimlaneRenderer
    : standardRenderer;
  const { get, set } = useScrollLocation(pageReset);

  const autosizing = useReverbValue(gridAutosizing);
  // When the scrubber is on it owns the grid's right edge; turn off
  // Spotlight's built-in scrollbar so the two don't fight for the gutter.
  const [scrubberEnabled] = fos.useGridScrubber();

  // `reset` is the grid's refresh signal. The callables below are routed
  // through a ref so their identities are not rebuild triggers — a transient
  // identity change from an unrelated state update must not destroy and
  // recreate the grid
  const renderers = {
    standard: standardRenderer.renderer,
    swimlane: swimlaneRenderer.renderer,
  };
  const refs = React.useRef({ get, page, renderers });
  refs.current = { get, page, renderers };

  const spotlight = useMemoOne(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) {
      return undefined;
    }

    cache.freeze();

    // Teardown must reach the renderer that created the items: swimlane
    // rows own inner instances that only its detachItem destroys.
    const kind = useSwimlanes ? "swimlane" : "standard";

    return new Spotlight<number, fos.Sample>({
      ...refs.current.get(),

      detachItem: (item) => refs.current.renderers[kind].detachItem(item),
      hideItem: (item) => refs.current.renderers[kind].hideItem(item),
      showItem: (item) => refs.current.renderers[kind].showItem(item),

      maxRows: MAX_ROWS,
      maxItemsSizeBytes: autosizing ? maxBytes : undefined,
      scrollbar: strip || !scrubberEnabled,
      // Strip: one full-height item per column, scrolling left to right.
      horizontal: strip,
      ...(strip ? { offset: 0 } : {}),
      // No vertical gap between swimlane rows — rows abut each other
      // so the view reads as a continuous stack. Standard grid mode
      // still uses the user's spacing setting.
      spacing: useSwimlanes ? 0 : spacing,
      // Use Spotlight's DEFAULT_OFFSET (48px) so the first row sits
      // below the transparent header. The header is rendered as an
      // absolute overlay with a gradient that fades over the grid's
      // top edge; without the offset, the first row collides with
      // the chrome and is hard to read through the gradient.
      get: (next) => refs.current.page(next),
      // Swimlane mode: force one item per row so each grid row
      // becomes one swimlane (cover + divider + siblings strip).
      // Threshold 0 always breaks the row at every item; default
      // `zoom` tiles per the aspect-ratio budget.
      rowAspectRatioThreshold: useSwimlanes || strip ? () => 0 : zoom,
    });
  }, [
    cache,
    autosizing,
    maxBytes,
    reset,
    resizing,
    scrubberEnabled,
    spacing,
    squareTiles,
    strip,
    useSwimlanes,
    zoom,
  ]);

  useEscape();
  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, strip, setResizing);

  return (
    <div className={styles.gridContainer}>
      <div
        id={id}
        className={clsx(styles.spotlightGrid, strip && styles.strip)}
        data-cy="fo-grid"
      />
      <div id={pixels} className={styles.fallingPixels}>
        <Storm className={styles.storm} />
      </div>
      {!strip && <GridScrubber />}
    </div>
  );
}

export default React.memo(Grid);
