import styles from "./Grid.module.css";

import Spotlight, { type Response } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import { Pending } from "@fiftyone/components";
import clsx from "clsx";
import { freeVideos } from "@fiftyone/looker";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { GridBackdropContext } from "@fiftyone/core/src/plugins/samples";
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
import { BoundedMap } from "../host/bounded";
import { createOwnership } from "../host/ownership";
import type { Lease } from "../host/pageSource";
import { SLOT } from "../host/createHost";
import { span } from "../host/marks";
import useHost from "../host/useHost";
import { createGridRenderer, type GridRenderer } from "./gridRenderer";
import GridPagesBar from "./Pages/GridPagesBar";
import { usePagesEnabled } from "./Pages/settings";
import useGridPages from "./Pages/useGridPages";
import { withRowAspects } from "./laneHeights";
import { showPending, showStorm } from "./loadingOverlay";
import useAutosize from "./useAutosize";
import useEscape from "./useEscape";
import useInstanceEvents from "./useInstanceEvents";
import useItemCache from "./useItemCache";
import useLabelVisibility from "./useLabelVisibility";
import useRecords, { useFractions } from "./useRecords";
import useRefreshers from "./useRefreshers";
import useRelayout, { type Excluded, excluding } from "./useRelayout";
import useRenderer from "./useRenderer";
import useScrollLocation from "./useScrollLocation";
import useSpotlightPager, { PAGE_SIZE } from "./useSpotlightPager";
import useGridOrder from "../order/useGridOrder";
import useGridRail from "./useGridRail";
import useOrigin from "./useOrigin";
import usePageSource from "./usePageSource";
import usePanelMemo from "./panelMemory";
import Storm from "./Storm";
import useSwimlaneRenderer from "./useSwimlaneRenderer";
import useUpdates from "./useUpdates";
import { warmKeys } from "./warming";
import useZoomSetting, { useSettledZoom } from "./useZoomSetting";

const MAX_INSTANCES = 200;
// samples one instance reads before it is rebuilt
const INSTANCE_ITEMS = 1000;
const MAX_INSTANCE_PAGES = INSTANCE_ITEMS / PAGE_SIZE;
// each looker's last size; more than the cache holds hidden plus a dense view
const MAX_SIZES = 2048;
const MAX_EXCLUDED = 1024;

const SHIMMER = {
  detachItem: () => {},
  hideItem: () => {},
  showItem: ({ element }: { element: HTMLDivElement }) => {
    element.classList.add(styles.tileShimmer);
    return Promise.resolve(0);
  },
};
const MAX_ROWS = 200;

type Page = Response<number, fos.Sample>;

function Grid({ layout }: { layout: "grid" | "groups" | "strip" }) {
  const id = useMemoOne(() => uuid(), []);
  const pixels = useMemoOne(() => uuid(), []);
  const backdrop = useContext(GridBackdropContext);
  const spacing = useReverbValue(gridSpacing);

  const {
    dataReset,
    gridReset: reset,
    itemsReset,
    pageReset,
    reset: refreshReset,
  } = useRefreshers();
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const zoom = useZoomSetting();

  useSyncLabelsRenderingStatus();

  const order = useGridOrder(dataReset);
  const [origin, seek] = useOrigin(pageReset);
  // sequences and rail places are relative to the origin
  const records = useRecords(`${pageReset}|${origin.id}`);
  const fractions = useFractions(`${pageReset}|${origin.id}`);

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
  const aspectRatioOverride = swimlaneAspect ?? (squareTiles ? 1 : undefined);
  const crop = useReverbValue(gridCrop);

  // a refresh (the logo) forgets which pages were requested, so they are
  // fetched again rather than served from the store
  const { forget, page, store } = useSpotlightPager({
    clearRecords: reset,
    clearRequests: refreshReset,
    fractions,
    order: order.get,
    origin,
    pageSelector: pageParameters,
    records,
    zoomSelector: gridCrop,
    aspectRatioOverride,
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
  // pages need offsets, which only a SMALL order has
  const paged = usePagesEnabled(layout) && order.mode === "SMALL";

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

  // a landed page warms its neighbor, except while the rail is dragged
  const dragging = useRef(false);
  const mode = useRef(order.mode);
  mode.current = order.mode;
  const warm = (key: number, start: number, result: Page) => {
    if (dragging.current) return;
    for (const next of warmKeys(key, start, result, mode.current)) {
      sourceRef.current.warm(next);
    }
  };

  // pages outlive instances and mounts, so a rebuild at a new size or a
  // return from a sample's page reads from memory; the key is what the pages
  // were fetched with
  const excluded = useRef<Excluded>(new BoundedMap(MAX_EXCLUDED));
  const source = usePageSource(
    JSON.stringify([
      reset,
      pageReset,
      crop,
      aspectRatioOverride ?? null,
      origin.id,
    ]),
    dataReset,
    (key, signal) =>
      page(key, signal).then((result) => excluding(result, excluded.current)),
    (result) => result.items.map((item) => item.id.description),
    (key, result) => {
      for (const { id } of result.items) {
        records.delete(id.description);
        fractions.delete(id.description);
      }
      forget(key);
    },
  );

  // a click opens the sample; its page steps through the pages held above
  const pages = useMemo(
    () => ({
      get: (key: number) => source.get(key),
      positionOf: (id: string) => {
        const sequence = records.get(id);
        if (sequence === undefined) return undefined;
        const key = Math.floor(sequence / PAGE_SIZE);
        const index =
          source
            .peek(key)
            ?.items.findIndex((item) => item.id.description === id) ?? -1;
        return index < 0 ? undefined : { key, index };
      },
    }),
    [records, source],
  );
  const setSample = fos.useExpandSample(pages);
  const setSampleRef = useRef(setSample);
  setSampleRef.current = setSample;
  const autosize = useAutosize({
    budget: maxBytes,
    cache,
    container,
    store,
    zoom,
  });
  const wire = useInstanceEvents(autosize.recommend);
  const ownership = useMemo(() => createOwnership(), [cache]);
  const interims = useRef(new WeakSet<object>());
  const cleanups = useRef(new WeakMap<object, () => void>());
  const scopes = useRef(new WeakMap<object, GridRenderer<fos.Sample>>());
  const lastSizes = useRef(new BoundedMap<string, [number, number]>(MAX_SIZES));
  // items each instance has loaded, for the rail thumb's scrollbar length
  const loadedItems = useRef(new WeakMap<object, { items: number }>());
  // each instance's reads, released with it
  const leases = useRef(new WeakMap<object, Lease<number, Page>>());
  // each instance's build timing, measured at its load, validation and swap
  const measures = useRef(new WeakMap<object, (phase: string) => void>());
  const hostRef = useRef<{ instance?: object }>();

  const { host, instance, status } = useHost<
    number,
    Spotlight<number, fos.Sample>
  >({
    ref: container,
    axis: strip ? "height" : "width",
    build: (anchor, { interim, quiet }) => {
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
        size: autosize.size,
        sizes: lastSizes.current,
      });
      const autosized = autosizing && !interim;
      // swimlanes and strips place one item per row
      const tiled = !useSwimlanes && !strip;
      // the row aspect ratio the first page's estimate starts this build at
      let start: number | undefined;
      const loaded = { items: 0 };
      const shown = hostRef.current?.instance;
      const lease = sourceRef.current.lease(
        quiet && shown ? leases.current.get(shown) : undefined,
      );
      const first = anchor?.key ?? 0;
      const toPage = (result: Response<number, fos.Sample>) => {
        loaded.items += result.items.length;
        if (autosized && tiled && start === undefined) {
          start = autosize.start(result.items);
        }
        return withRowAspects(result, aspects);
      };
      const next = new Spotlight<number, fos.Sample>({
        key: first,
        at: anchor?.at,

        ...scoped,

        maxRows: MAX_ROWS,
        maxItemsSizeBytes: autosized ? maxBytes : undefined,
        // the rail, when shown, hides it
        scrollbar: true,
        // Strip: one full-height item per column, scrolling left to right.
        horizontal: strip,
        ...(strip ? { offset: 0 } : {}),
        // swimlane rows abut so the view reads as one continuous stack
        spacing: useSwimlanes ? 0 : spacing,
        onItemClick: (item) => setSampleRef.current(item),
        get: (key) =>
          lease.get(key).then((result) => {
            warm(key, first, result);
            return toPage(result);
          }),
        // nothing on screen (a mount) or a quiet rebuild: pages in memory lay
        // out before paint; a rebuild behind a visible instance keeps its
        // asynchronous swap
        peek:
          hostRef.current?.instance && !quiet
            ? undefined
            : (key) => {
                const result = lease.peek(key);
                return result && toPage(result);
              },
        rowAspectRatioThreshold: tiled
          ? (width) => Math.min(zoom(width), start ?? Infinity)
          : () => 0,
      });
      const measure = span(`build:${first}`);
      next.addEventListener("load", () => measure("load"));
      next.addEventListener("validated", () => measure("validated"));
      measures.current.set(next, measure);
      scopes.current.set(next, scoped);
      leases.current.set(next, lease);
      loadedItems.current.set(next, loaded);
      if (interim) interims.current.add(next);
      else cleanups.current.set(next, wire(next));
      return next;
    },
    onSwap: (next, previous) => {
      measures.current.get(next)?.("ready");
      swapRef.current(next, previous);
    },
    // a panel resize (the sidebar showing or hiding) moves the tiles, like
    // a relayout
    onResize: () => animateRef.current(),
    outgrown: (instance) =>
      (leases.current.get(instance)?.size ?? 0) > MAX_INSTANCE_PAGES,
    busy: () => animatingRef.current(),
    onAnchor: (anchor) =>
      set({
        at: { description: anchor.at?.description ?? "" },
        fraction: anchor.at?.fraction ?? 0,
        page: anchor.key,
      }),
    onDispose: (disposed) => {
      leases.current.get(disposed)?.release();
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
  const animateRef = useRef(relayout.animate);
  animateRef.current = relayout.animate;
  const animatingRef = useRef(relayout.animating);
  animatingRef.current = relayout.animating;
  const rail = useGridRail({
    // scroll events do not bubble; the container hears them while capturing
    onScroll: (listener) => {
      const element = container.current;
      element?.addEventListener("scroll", listener, {
        capture: true,
        passive: true,
      });
      return () =>
        element?.removeEventListener("scroll", listener, { capture: true });
    },
    extent: () => {
      const scroller = container.current?.querySelector(`[${SLOT}="active"]`)
        ?.lastElementChild as HTMLElement | null | undefined;
      const items = instance && loadedItems.current.get(instance)?.items;
      if (!scroller || !items) return undefined;
      return strip
        ? {
            items,
            loaded: scroller.scrollWidth,
            scrolled: scroller.scrollLeft,
            viewport: scroller.clientWidth,
          }
        : {
            items,
            loaded: scroller.scrollHeight,
            scrolled: scroller.scrollTop,
            viewport: scroller.clientHeight,
          };
    },
    fractions,
    host,
    instance,
    order: order.order,
    origin,
    pageSize: PAGE_SIZE,
    paged,
    ready: status === "ready",
    seek,
    sequences: records,
  });
  const railVisible = rail.mode.kind === "offset" || rail.mode.kind === "value";
  const railDrag = rail.drag;
  const onRailDrag = useCallback(
    (next: boolean) => {
      dragging.current = next;
      next && source.dispose();
      railDrag(next);
    },
    [railDrag, source],
  );

  // a setting that changes layout means a new instance, at the saved location
  const settings = useMemo(
    () => ({
      autosizing,
      laneHeights: swimlaneRenderer.heights,
      maxBytes,
      paged,
      reset,
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
      spacing,
      squareTiles,
      strip,
      useSwimlanes,
      zoom,
    ],
  );
  // new data (a dataset, view or filter) starts over rather than from the
  // last location, which belongs to the previous data; a new sort keeps the
  // grid up and moves the items it shares into their new order
  const { reorder } = relayout;
  const lastPageReset = useRef(pageReset);
  const lastItemsReset = useRef(itemsReset);
  // whether this panel's grid has shown this data, across mounts: returning
  // from a sample's page shows the grid, not the storm
  const loaded = usePanelMemo("loaded", pageReset, () => ({ current: false }));
  // a layout effect, so a mount's first build paints with the mount
  useLayoutEffect(() => {
    if (lastPageReset.current !== pageReset) {
      lastPageReset.current = pageReset;
      if (lastItemsReset.current === itemsReset) {
        reorder({ key: 0 });
        return;
      }
      lastItemsReset.current = itemsReset;
      loaded.current = false;
      host?.reset();
      return;
    }
    host?.rebuild(pageAnchor(get()));
  }, [get, host, itemsReset, pageAnchor, pageReset, reorder, settings]);

  const fetching = useSyncExternalStore(
    source.subscribe,
    () => source.fetching,
  );
  if (status === "ready") loaded.current = true;

  // a view change shows the storm as it starts, not when its data lands; it
  // holds a frame after, so the reset that follows takes over without a gap
  const entryPending = useReverbValue(fos.pendingEntry);
  const operatorViewPending = useReverbValue(fos.viewChangePending);
  const viewPending = entryPending || operatorViewPending;
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    if (viewPending) {
      setHolding(true);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setHolding(false));
    return () => cancelAnimationFrame(frame);
  }, [viewPending]);
  const storm =
    showStorm({ everLoaded: loaded.current }) || viewPending || holding;
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

  // the storm covers the panel it sits in when the panel offers a backdrop
  const pixelsOverlay = (
    <div
      id={pixels}
      className={clsx(styles.fallingPixels, !storm && styles.hidden)}
    >
      <Storm className={styles.storm} />
    </div>
  );

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
      {backdrop ? createPortal(pixelsOverlay, backdrop) : pixelsOverlay}
      <div ref={overlay} className={styles.relayoutOverlay} />
      {pending && !railVisible && (
        <div className={styles.pending}>
          <Pending />
        </div>
      )}
      <GridRail
        horizontal={strip}
        loading={pending}
        onDrag={onRailDrag}
        rail={rail}
      />
      {paged && (
        <GridPagesBar
          grid={container}
          pages={paging.pages}
          total={order.order?.kind === "order" ? (order.order.total ?? 0) : 0}
        />
      )}
    </div>
  );
}

export default React.memo(Grid);
