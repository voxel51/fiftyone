import styles from "./Grid.module.css";

import Spotlight from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { Pending } from "@fiftyone/components";
import clsx from "clsx";
import { freeVideos } from "@fiftyone/looker";
import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { useMemoOne } from "use-memo-one";
import { v4 as uuid } from "uuid";
import { useSyncLabelsRenderingStatus } from "@fiftyone/core/src/hooks";
import GridRail from "./GridRail";
import {
  gridAutosizing,
  gridSquareTiles,
  gridCrop,
  gridSpacing,
  maxGridItemsSizeBytes,
  pageParameters,
} from "./atoms";
import { createPageSource } from "../host/pageSource";
import { createOwnership } from "../host/ownership";
import { SLOT } from "../host/createHost";
import useHost from "../host/useHost";
import { createGridRenderer, type GridRenderer } from "./gridRenderer";
import GridPagesBar from "./Pages/GridPagesBar";
import { usePagesEnabled } from "./Pages/settings";
import useGridPages from "./Pages/useGridPages";
import { withRowAspects } from "./laneHeights";
import { showPending, showStorm } from "./loadingOverlay";
import useEscape from "./useEscape";
import useInstanceEvents from "./useInstanceEvents";
import useItemCache from "./useItemCache";
import useLabelVisibility from "./useLabelVisibility";
import useRecords from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRelayout, { excluding } from "./useRelayout";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager, { PAGE_SIZE } from "./useSpotlightPager";
import useRail from "../rail/useRail";
import Storm from "./Storm";
import useSwimlaneRenderer from "./useSwimlaneRenderer";
import useUpdates from "./useUpdates";
import useZoomSetting, { useSettledZoom } from "./useZoomSetting";

const MAX_INSTANCES = 200;

const SHIMMER = {
  detachItem: () => {},
  hideItem: () => {},
  showItem: ({ element }: { element: HTMLDivElement }) => {
    element.classList.add(styles.tileShimmer);
    return Promise.resolve(0);
  },
};
const MAX_ROWS = 200;

function Grid({ layout }: { layout: "grid" | "groups" | "strip" }) {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const spacing = useReverbValue(gridSpacing);

  const { dataReset, gridReset: reset, pageReset } = useRefreshers();
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
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
  const zoomValue = useSettledZoom();
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
  const paged = usePagesEnabled(layout);
  const railVisible = !paged;

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

  // pages outlive instances, so a rebuild at a new size reads from memory
  const excluded = useRef(new Set<string>());
  const source = useMemo(
    () =>
      createPageSource(
        (key: number) =>
          page(key).then((result) => excluding(result, excluded.current)),
        { ids: (result) => result.items.map((item) => item.id.description) },
      ),
    [page],
  );
  const wire = useInstanceEvents();
  const ownership = useMemo(() => createOwnership(), [cache]);
  const interims = useRef(new WeakSet<object>());
  const cleanups = useRef(new WeakMap<object, () => void>());
  const scopes = useRef(new WeakMap<object, GridRenderer<fos.Sample>>());
  const lastSizes = useRef(new Map<string, [number, number]>());
  // items each instance has loaded, for the rail thumb's scrollbar length
  const loadedItems = useRef(new WeakMap<object, { items: number }>());
  const hostRef = useRef<{ instance?: object }>();

  const { host, instance, status } = useHost<
    number,
    Spotlight<number, fos.Sample>
  >({
    ref: container,
    axis: strip ? "height" : "width",
    build: (anchor, { interim }) => {
      // Teardown must reach the renderer that created the items: swimlane
      // rows own inner instances that only its detachItem destroys.
      const kind = useSwimlanes ? "swimlane" : "standard";
      const aspects = useSwimlanes
        ? swimlaneRenderer.rowAspects(container.current?.clientWidth ?? 0)
        : undefined;
      const scoped = createGridRenderer<fos.Sample>({
        base: () => refs.current.renderers[kind],
        cached: (key) => Boolean(cache.get(key)),
        deferred: Boolean(hostRef.current?.instance),
        interim,
        ownership,
        reattach: kind === "standard",
        shimmer: SHIMMER.showItem,
        sizes: lastSizes.current,
      });
      const loaded = { items: 0 };
      const next = new Spotlight<number, fos.Sample>({
        key: anchor?.key ?? 0,
        at: anchor?.at,

        ...scoped,

        maxRows: MAX_ROWS,
        maxItemsSizeBytes: autosizing && !interim ? maxBytes : undefined,
        scrollbar: !railVisible,
        // Strip: one full-height item per column, scrolling left to right.
        horizontal: strip,
        ...(strip ? { offset: 0 } : {}),
        // swimlane rows abut so the view reads as one continuous stack
        spacing: useSwimlanes ? 0 : spacing,
        get: (key) =>
          sourceRef.current.get(key).then((p) => {
            loaded.items += p.items.length;
            return withRowAspects(p, aspects);
          }),
        // swimlanes and strips place one item per row
        rowAspectRatioThreshold: useSwimlanes || strip ? () => 0 : zoom,
      });
      scopes.current.set(next, scoped);
      loadedItems.current.set(next, loaded);
      if (interim) interims.current.add(next);
      else cleanups.current.set(next, wire(next));
      return next;
    },
    onSwap: (next, previous) => swapRef.current(next, previous),
    onAnchor: (anchor) =>
      set({
        at: { description: anchor.at?.description ?? "" },
        fraction: anchor.at?.fraction ?? 0,
        page: anchor.key,
      }),
    onDispose: (disposed) => {
      cleanups.current.get(disposed)?.();
      freeVideos();
    },
  });
  const { anchor: pageAnchor, ...paging } = useGridPages({
    fetchSize: PAGE_SIZE,
    host,
    layout,
    source,
  });
  const sourceRef = useRef(paging.source);
  sourceRef.current = paging.source;
  hostRef.current = host;
  const relayout = useRelayout<Spotlight<number, fos.Sample>, fos.Sample>({
    cache,
    container,
    dataReset,
    excluded: excluded.current,
    interims: interims.current,
    overlay,
    scopes: scopes.current,
    source,
    zoom: zoomValue,
  });
  relayout.setHost(host);
  const swapRef = useRef(relayout.swap);
  swapRef.current = relayout.swap;
  const rail = useRail({
    extent: () => {
      const scroller = container.current?.querySelector(`[${SLOT}="active"]`)
        ?.lastElementChild as HTMLElement | null | undefined;
      const items = instance && loadedItems.current.get(instance)?.items;
      if (!scroller || !items) return undefined;
      return strip
        ? {
            items,
            loaded: scroller.scrollWidth,
            viewport: scroller.clientWidth,
          }
        : {
            items,
            loaded: scroller.scrollHeight,
            viewport: scroller.clientHeight,
          };
    },
    host,
    instance,
    pageSize: PAGE_SIZE,
    ranks: records,
  });

  // a setting that changes layout means a new instance, at the saved location
  const settings = useMemo(
    () => ({
      autosizing,
      laneHeights: swimlaneRenderer.heights,
      maxBytes,
      paged,
      reset,
      railVisible,
      spacing,
      squareTiles,
      strip,
      useSwimlanes,
      zoom,
    }),
    [
      autosizing,
      maxBytes,
      swimlaneRenderer.heights,
      paged,
      reset,
      railVisible,
      spacing,
      squareTiles,
      strip,
      useSwimlanes,
      zoom,
    ],
  );
  useEffect(() => {
    host?.rebuild(pageAnchor(get()));
  }, [get, host, pageAnchor, settings]);

  const fetching = useSyncExternalStore(
    source.subscribe,
    () => source.fetching,
  );
  const loaded = useRef(false);
  if (status === "ready") loaded.current = true;
  const storm = showStorm({ everLoaded: loaded.current });
  const pending = showPending({
    building: status === "building",
    everLoaded: loaded.current,
    fetching,
    interim: Boolean(instance && interims.current.has(instance)),
  });

  useEscape();
  useUpdates({
    cache,
    getFontSize,
    options: lookerOptions,
    spotlight: instance,
  });

  return (
    <div className={styles.gridContainer}>
      <div
        id={id}
        ref={container}
        className={clsx(
          styles.spotlightGrid,
          strip && styles.strip,
          railVisible && styles.railOn,
          paging.className,
        )}
        data-cy="fo-grid"
      />
      <div
        id={pixels}
        className={clsx(styles.fallingPixels, !storm && styles.hidden)}
      >
        <Storm className={styles.storm} />
      </div>
      <div ref={overlay} className={styles.relayoutOverlay} />
      {pending && (
        <div className={styles.pending}>
          <Pending />
        </div>
      )}
      <GridRail horizontal={strip} rail={rail} visible={railVisible} />
      {paged && <GridPagesBar grid={container} pages={paging.pages} />}
    </div>
  );
}

export default React.memo(Grid);
