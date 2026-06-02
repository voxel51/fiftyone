/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A single horizontal Spotlight scoped to one group slice. Used by
 * {@link Swimlanes} to render one strip per slice. Each lane owns its
 * own Spotlight instance, looker cache, and pager — sibling lanes do
 * not share scroll position, fetched pages, or DOM.
 */

import Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, { useCallback, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import styles from "./Grid.module.css";
import { gridCrop, gridSpacing, swimlanePageParameters } from "./recoil";
import useEvents from "./useEvents";
import useLabelVisibility from "./useLabelVisibility";
import useLookerCache from "./useLookerCache";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRenderer from "./useRenderer";
import useResize from "./useResize";
import useSpotlightPager from "./useSpotlightPager";
import useUpdates from "./useUpdates";
import useZoomSetting from "./useZoomSetting";

const MAX_INSTANCES_PER_LANE = 100;
const MAX_ROWS_PER_LANE = 50;

interface LaneProps {
  /** Group slice this lane is scoped to. Drives `swimlanePageParameters`. */
  slice: string;
  /** Fraction of the host's byte budget this lane is allowed to consume. */
  byteShare: number;
  /**
   * Total byte budget shared across all lanes; the lane's effective cap
   * is `byteShare * maxBytes / 2` (the `/2` mirrors `Grid`: half for
   * the hidden cache, half for max shown).
   */
  maxBytes: number;
}

const Lane: React.FC<LaneProps> = ({ slice, byteShare, maxBytes }) => {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useRecoilValue(gridSpacing);
  const { pageReset, reset } = useRefreshers();
  const [resizing, setResizing] = useState(false);
  const zoom = useZoomSetting();

  const records = useRecords(pageReset);

  const laneBytes = (maxBytes * byteShare) / 2;
  const cache = useLookerCache({
    maxHiddenItems: MAX_INSTANCES_PER_LANE,
    maxHiddenItemsSizeBytes: laneBytes,
    reset,
    ...useLabelVisibility(),
  });

  const { page, store } = useSpotlightPager({
    clearRecords: reset,
    pageSelector: swimlanePageParameters(slice),
    records,
    zoomSelector: gridCrop,
  });

  const { getFontSize, lookerOptions, renderer } = useRenderer({
    cache,
    id,
    records,
    store,
  });

  // Each lane's scroll position is purely Spotlight-internal. The
  // shared `gridAt`/`gridPage`/`gridOffset` atoms belong to the
  // single-grid view; if every lane wrote into them on `rowchange`
  // the lanes would clobber each other. Cross-mount persistence and
  // scrubber wiring don't apply to swimlanes V1.
  const get = useCallback(() => ({ key: 0 }), []);
  const set = useCallback(() => undefined, []);

  const setSample = fos.useExpandSample(store);

  const spotlight = useMemoOne(() => {
    /** SPOTLIGHT REFRESHER */
    reset;
    /** SPOTLIGHT REFRESHER */

    if (resizing) return undefined;

    cache.freeze();

    const spotlight = new Spotlight<number, fos.Sample>({
      ...get(),
      ...renderer,

      // The lane runs horizontally: rows extend left → right, vertical
      // scroll is owned by the parent Swimlanes container. The native
      // scrollbar is intentionally on so users have a familiar drag
      // handle for fast traversal within a slice.
      horizontal: true,
      scrollbar: true,
      maxRows: MAX_ROWS_PER_LANE,
      maxItemsSizeBytes: laneBytes,
      spacing,

      get: (next) => page(next),
      onItemClick: (args) => setSample(args, () => spotlight.createIter()),
      rowAspectRatioThreshold: zoom,
    });
    return spotlight;
  }, [
    cache,
    get,
    laneBytes,
    page,
    renderer,
    reset,
    resizing,
    setSample,
    spacing,
    zoom,
  ]);

  useEvents({ id, cache, pixels, resizing, set, spotlight });
  useUpdates({ cache, getFontSize, options: lookerOptions, spotlight });
  useResize(id, setResizing);

  return (
    <div className={styles.swimlane}>
      <div className={styles.swimlaneLabel} title={slice}>
        {slice}
      </div>
      <div className={styles.swimlaneTrack}>
        <div id={id} className={styles.spotlightGrid} data-cy="fo-swimlane" />
        <div id={pixels} className={styles.fallingPixels} />
      </div>
    </div>
  );
};

export default React.memo(Lane);
