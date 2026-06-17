import type { ID, ItemClick, ItemData } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import styles from "./Grid.module.css";
import { drawOverlays, type Coloring } from "./gridOverlays";
import useSpineLayout from "./useSpineLayout";
import {
  PAGE_SIZE,
  isPlaceholder,
  type GridNode,
  type SampleStore,
  type SpineEntry,
} from "./useSpotlightPager";
import useVirtualScroll from "./useVirtualScroll";

// settle threshold in rows/sec — at or below this, the in-view window loads.
const SETTLE_ROWS_PER_SEC = 2;
// accelerated (flick) threshold in rows/sec — above this the depth readout grows;
// slow/small scrolls keep the small bottom badge (no distracting size change).
const ACCEL_ROWS_PER_SEC = 8;
// extra rows above/below the viewport kept MOUNTED for smoothness.
const OVERSCAN_ROWS = 3;
// how many samples per `paginateSamples` request — fetch MANY at once (round trips
// are the cost). The loader pulls these batches by scroll position, decoupled from
// which tiles are mounted, and bumps per batch so tiles fill progressively.
const FETCH_BATCH = 80;
// pages prefetched ahead of the viewport (loaded in the same big batches).
const LOOKAHEAD_PAGES = 2;
// scroll indicators linger this long after motion stops.
const INDICATOR_FADE_MS = 900;
const THUMB_MIN_PX = 24;

interface CellBox {
  index: number;
  id?: string;
  /** signed media URL once the (cheap, separate) URL fetch has landed — the image
   * paints from this immediately, before the heavy label/overlay read. */
  url?: string;
  x: number;
  y: number; // virtual y (absolute, pre-vTop)
  width: number;
  height: number;
}

/** One grid cell: a wireframe while scrolling; on settle it paints its image (from
 * the cheap URL fetch) and draws boxes/label-chips on a 2D canvas — NO looker, so no
 * image repaint (flash) and no worker flood (every tile gets overlays). */
const Cell = ({
  cell,
  vTop,
  version,
  idFor,
  store,
  coloring,
  activePaths,
  onOpen,
}: {
  cell: CellBox;
  vTop: number;
  /** bumps when settle-loaded labels land in the store; re-draws the overlays. */
  version: number;
  idFor: (id: string) => ID;
  store: SampleStore;
  coloring: Coloring;
  activePaths: ReadonlyArray<string>;
  onOpen?: (index: number, id: string, event: React.MouseEvent) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { id, url, width, height } = cell;

  // A plain click opens the modal (meta/ctrl/shift reserved for selection).
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!id || !onOpen) return;
      if (event.metaKey || event.shiftKey || event.ctrlKey) return;
      event.preventDefault();
      onOpen(cell.index, id, event);
    },
    [id, onOpen, cell.index]
  );

  // Paint overlays from the sample's INLINE labels onto the canvas over the <img>.
  // Painting is NOT gated on scroll motion — an already-loaded tile stays painted
  // while scrolling (only FETCHING is motion-gated); a tile is a wireframe only when
  // its data isn't loaded. The media AR comes from the rendered img's NATURAL dims
  // (the exact source `object-fit: contain` uses) so boxes/masks align at any tile AR.
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const clear = () =>
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    if (!id) return clear();
    const node = (store as unknown as WeakMap<ID, GridNode>).get(idFor(id));
    const sample = node?.sample as Record<string, unknown> | undefined;
    if (!sample) return clear();
    const img = imgRef.current;
    const mediaAspect =
      img && img.naturalWidth && img.naturalHeight
        ? img.naturalWidth / img.naturalHeight
        : undefined;
    drawOverlays(
      canvas,
      sample,
      activePaths,
      coloring,
      width,
      height,
      mediaAspect
    );
  }, [id, width, height, idFor, store, coloring, activePaths]);

  // redraw when data lands (`version`) or layout/identity changes (`paint` deps).
  useEffect(() => {
    paint();
  }, [paint, version]);

  return (
    <div
      className={styles.spotlightWireframe}
      onClick={onOpen ? handleClick : undefined}
      style={{
        position: "absolute",
        top: 0,
        left: cell.x,
        width,
        height,
        cursor: id && onOpen ? "pointer" : undefined,
        transform: `translateY(${cell.y - vTop}px)`,
      }}
    >
      {/* image paints immediately from the cheap signed-URL fetch (never blank) */}
      {url && (
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          onLoad={paint}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}
      {/* overlays drawn on top from inline labels (boxes + chips); no looker */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

/**
 * Virtualized infinite-scroll grid: a synthetic virtual scroll lays out
 * deterministic rows from the cached spine; only in-view rows are mounted;
 * wireframe cells track motion instantly; media loads only when the scroll
 * settles (<= ~rows/sec). A virtual scrollbar thumb + depth readout show
 * position without a full-content DOM.
 */
export default function InfiniteGrid({
  id,
  reset,
  ensureSpineWindow,
  hydrateWindow,
  signUrls,
  store,
  onItemClick,
}: {
  id: string;
  /** changes when the view/filter resets — invalidates index-keyed caches. */
  reset: string;
  ensureSpineWindow: (start: number, count: number) => Promise<SpineEntry[]>;
  hydrateWindow: (ids: ReadonlyArray<string>) => Promise<Map<string, GridNode>>;
  /** cheap signed-URL fetch (no labels) — paints images before overlays. */
  signUrls: (ids: ReadonlyArray<string>) => Promise<Map<string, string>>;
  store: SampleStore;
  /** opens the modal for a clicked tile (the spotlight grid's onItemClick). */
  onItemClick?: ItemClick<number, fos.Sample>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // active label field paths + color scheme — drives the per-tile overlay drawing
  // (boxes/chips colored to match the sidebar). Stable across scroll.
  const activeFields = useRecoilValue(fos.activeFields({ modal: false }));
  const fullColoring = useRecoilValue(fos.coloring);
  const coloring = useMemo<Coloring>(
    () => ({ pool: fullColoring.pool, seed: fullColoring.seed }),
    [fullColoring.pool, fullColoring.seed]
  );

  // stable ID objects per sample id (the looker store is keyed by object identity).
  const idObjs = useRef(new Map<string, ID>());
  const idFor = useMemo(
    () => (sampleId: string) => {
      let obj = idObjs.current.get(sampleId);
      if (!obj) {
        obj = { description: sampleId };
        idObjs.current.set(sampleId, obj);
      }
      return obj;
    },
    []
  );

  // measure SYNCHRONOUSLY before paint (so the first frame already has wireframes,
  // not a black screen), then keep it current with a ResizeObserver.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.width === r.width && s.height === r.height
          ? s
          : { width: r.width, height: r.height }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useSpineLayout(size.width);
  const { vTop, moving, fast, scrollTo } = useVirtualScroll({
    elementRef: viewportRef,
    virtualHeight: layout.virtualHeight,
    viewportHeight: size.height,
    settleSpeed: layout.rowHeight * SETTLE_ROWS_PER_SEC,
    acceleratedSpeed: layout.rowHeight * ACCEL_ROWS_PER_SEC,
  });

  // Open the modal for a clicked tile. The infinite grid has no spotlight
  // engine, so modal next/previous navigation rides a spine-index cursor: each
  // step resolves the neighbouring index from the spine and hydrates it into the
  // looker store (so `useExpandSample`'s reader finds it). The clicked sample is
  // hydrated first for the same reason — otherwise the modal silently never
  // opens (its query is keyed off the modal selector this sets).
  const openSample = useCallback(
    (index: number, sampleId: string, event: React.MouseEvent) => {
      if (!onItemClick) {
        console.error(
          "[infinite-grid] tile clicked but no onItemClick wired; modal cannot open"
        );
        return;
      }
      const total = layout.totalCount;
      const ss = store as unknown as WeakMap<ID, GridNode>;
      const nativeEvent = event.nativeEvent;
      let pos = index;

      const iter = {
        next: async (offset: number, soft?: boolean) => {
          const target = pos + offset;
          if (target < 0 || (total > 0 && target >= total)) return undefined;
          try {
            const [entry] = await ensureSpineWindow(target, 1);
            if (!entry) return undefined;
            const obj = idFor(entry.id);
            if (!soft) {
              pos = target;
              if (!ss.has(obj)) {
                const node = (await hydrateWindow([entry.id])).get(entry.id);
                if (node) ss.set(obj, node);
              }
            }
            return obj;
          } catch (e) {
            console.error(
              "[infinite-grid] modal navigation failed at index",
              target,
              e
            );
            return undefined;
          }
        },
      };

      const obj = idFor(sampleId);
      const fire = () => {
        try {
          console.debug(
            "[infinite-grid] opening modal for sample",
            sampleId,
            "at index",
            index
          );
          onItemClick({
            event: nativeEvent,
            item: { id: obj } as unknown as ItemData<number, fos.Sample>,
            iter,
          });
        } catch (e) {
          console.error(
            "[infinite-grid] failed to open modal for sample",
            sampleId,
            e
          );
        }
      };

      // The looker reader throws if the clicked sample isn't in the store, so
      // hydrate it first when missing rather than fail the open.
      if (ss.has(obj)) {
        fire();
      } else {
        void hydrateWindow([sampleId])
          .then((nodes) => {
            const node = nodes.get(sampleId);
            if (node) ss.set(obj, node);
            else
              console.error(
                "[infinite-grid] could not hydrate clicked sample",
                sampleId,
                "- opening anyway"
              );
            fire();
          })
          .catch((e) =>
            console.error(
              "[infinite-grid] hydrate failed for clicked sample",
              sampleId,
              e
            )
          );
      }
    },
    [
      onItemClick,
      layout.totalCount,
      ensureSpineWindow,
      hydrateWindow,
      store,
      idFor,
    ]
  );

  // the absolute index range currently in view (+ overscan).
  const range = useMemo(
    () =>
      size.height
        ? layout.indexRange(vTop, size.height, OVERSCAN_ROWS)
        : { start: 0, end: 0 },
    [vTop, size.height, layout]
  );

  // spine entries by index (ids) + signed URLs by id, in refs so accumulating never
  // copies a growing map; a version bump re-renders when NEW ids/urls/nodes land.
  const entriesRef = useRef(new Map<number, SpineEntry>());
  const urlsRef = useRef(new Map<string, string>());
  const [entriesVersion, setEntriesVersion] = useState(0);
  // ids whose label hydrate is in flight, so overlapping loads never re-request.
  const inflight = useRef(new Set<string>());
  // the greatest scroll depth reached this session — the scroll-up scrollbar spans
  // [0, maxReached], not the full (2M-row) virtual height.
  const maxReachedRef = useRef(0);

  // DECOUPLED loader — driven by scroll position, NOT by tile mounts. Two cheap
  // reads, separate from each other, so the user NEVER sees blackness:
  //   1) spine ids → positioned wireframes immediately;
  //   2) signed URLs (lightweight, big batch) → the IMAGE paints (no overlays yet);
  //   3) full sample + labels (`paginateSamples`) → tiles draw boxes/chips on a
  //      cheap 2D canvas over the image (no looker, no worker → no flash, no flood).
  // The VISIBLE window is loaded first (urls then labels), then the off-screen
  // look-ahead — all async, nothing blocks.
  useEffect(() => {
    if (moving || range.end <= range.start) return undefined;
    const start = Math.floor(range.start / PAGE_SIZE) * PAGE_SIZE;
    const end =
      (Math.ceil(range.end / PAGE_SIZE) + LOOKAHEAD_PAGES) * PAGE_SIZE;
    const visEnd = Math.ceil(range.end / PAGE_SIZE) * PAGE_SIZE;
    const ss = store as unknown as WeakMap<ID, GridNode>;

    // sign + cache URLs for a batch → IMAGES paint (cheap; no labels).
    const loadUrls = async (ids: string[]) => {
      const need = ids.filter((id) => !urlsRef.current.has(id));
      if (!need.length) return;
      const urls = await signUrls(need);
      if (urls.size) {
        for (const [id, u] of urls) urlsRef.current.set(id, u);
        setEntriesVersion((v) => v + 1);
      }
    };
    // hydrate full samples for a batch → the looker attaches OVERLAYS.
    const loadLabels = async (ids: string[]) => {
      const need = ids.filter(
        (id) => isPlaceholder(ss.get(idFor(id))) && !inflight.current.has(id)
      );
      if (!need.length) return;
      need.forEach((id) => inflight.current.add(id));
      try {
        const nodes = await hydrateWindow(need);
        for (const [sid, node] of nodes) ss.set(idFor(sid), node);
      } finally {
        need.forEach((id) => inflight.current.delete(id));
      }
      setEntriesVersion((v) => v + 1);
    };

    void (async () => {
      const got = await ensureSpineWindow(start, end - start);
      if (!got.length) return;
      // publish ids first → positioned wireframes appear immediately.
      let changed = false;
      const visible: string[] = [];
      const ahead: string[] = [];
      got.forEach((e, i) => {
        if (!entriesRef.current.has(start + i)) {
          entriesRef.current.set(start + i, e);
          changed = true;
        }
        (start + i < visEnd ? visible : ahead).push(e.id);
      });
      if (changed) setEntriesVersion((v) => v + 1);

      // VISIBLE first: images (fast) then overlays. Then off-screen in big batches.
      await loadUrls(visible);
      await loadLabels(visible);
      for (let i = 0; i < ahead.length; i += FETCH_BATCH) {
        const batch = ahead.slice(i, i + FETCH_BATCH);
        await loadUrls(batch);
        await loadLabels(batch);
      }
    })();
    return undefined;
  }, [
    moving,
    range.start,
    range.end,
    ensureSpineWindow,
    signUrls,
    hydrateWindow,
    store,
    idFor,
  ]);

  // a view/filter reset re-keys the spine; drop the index-keyed caches so stale
  // (index → sample) mappings never paint after the underlying set changes. Guarded
  // so it only fires on an ACTUAL change — never on mount (which would wipe the
  // initial in-view load before it paints).
  const resetRef = useRef(reset);
  useEffect(() => {
    if (resetRef.current === reset) return;
    resetRef.current = reset;
    entriesRef.current = new Map();
    urlsRef.current = new Map();
    idObjs.current = new Map();
    maxReachedRef.current = 0;
    setEntriesVersion((v) => v + 1);
  }, [reset]);

  // cells for the in-view index range. A cell shows whatever's LOADED (image +
  // overlays) regardless of scroll motion — already-loaded tiles stay painted while
  // scrolling; a cell is a wireframe only until its id/image/labels have loaded.
  const cells = useMemo<CellBox[]>(() => {
    const out: CellBox[] = [];
    for (let index = range.start; index < range.end; index++) {
      const { x, y } = layout.posOf(index);
      const id = entriesRef.current.get(index)?.id;
      out.push({
        index,
        id,
        url: id ? urlsRef.current.get(id) : undefined,
        x,
        y,
        width: layout.cellWidth,
        height: layout.rowHeight,
      });
    }
    return out;
    // entriesVersion participates so settle-loaded ids/urls appear.
  }, [range, layout, entriesVersion]);

  // indicator visibility: on while scrolling, fading shortly after it stops.
  const [indicate, setIndicate] = useState(false);
  useEffect(() => {
    if (moving) {
      setIndicate(true);
      return undefined;
    }
    const t = setTimeout(() => setIndicate(false), INDICATOR_FADE_MS);
    return () => clearTimeout(t);
  }, [moving, vTop]);

  // virtual scrollbar thumb geometry + drag-to-scroll.
  // scroll-up scrollbar: the thumb spans only the DEEPEST point reached so far,
  // not the full virtual height (the whole 2M-row dataset). Wheel/fling scroll DOWN
  // past it — which grows it; the thumb only jumps back UP within explored
  // territory, and its bottom is the deepest you've been.
  maxReachedRef.current = Math.max(maxReachedRef.current, vTop);
  const explored = maxReachedRef.current;
  const exploredContent = explored + size.height;
  const thumbHeight =
    exploredContent > 0
      ? Math.max(THUMB_MIN_PX, (size.height / exploredContent) * size.height)
      : 0;
  const thumbTop =
    explored > 0 ? (vTop / explored) * (size.height - thumbHeight) : 0;
  const drag = useRef<{ y: number; vTop: number } | null>(null);
  const onThumbDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { y: e.clientY, vTop };
    },
    [vTop]
  );
  const onThumbMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const travel = size.height - thumbHeight;
      if (travel <= 0) return;
      const dy = e.clientY - drag.current.y;
      const reached = maxReachedRef.current;
      // bound to explored territory — the thumb can't drag past the deepest point.
      scrollTo(
        Math.min(
          Math.max(drag.current.vTop + (dy / travel) * reached, 0),
          reached
        )
      );
    },
    [scrollTo, size.height, thumbHeight]
  );
  const onThumbUp = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const topIndex = layout.itemsPerRow
    ? Math.floor(vTop / layout.rowStride) * layout.itemsPerRow
    : 0;

  return (
    <div
      ref={viewportRef}
      id={id}
      className={styles.spotlightGrid}
      data-cy="fo-grid"
      tabIndex={0}
      style={{ overflow: "hidden", outline: "none" }}
    >
      {cells.map((cell) => (
        <Cell
          key={cell.index}
          cell={cell}
          vTop={vTop}
          version={entriesVersion}
          idFor={idFor}
          store={store}
          coloring={coloring}
          activePaths={activeFields}
          onOpen={openSample}
        />
      ))}

      {/* loading animation on initial load, until the first media has landed */}
      {urlsRef.current.size === 0 && <div className={styles.fallingPixels} />}

      {explored > 0 && (
        <div
          className={`${styles.virtualScrollbar}${
            indicate ? ` ${styles.visible}` : ""
          }`}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          style={{ top: thumbTop, height: thumbHeight }}
        />
      )}

      {layout.totalCount > 0 && (
        <div
          className={`${styles.scrollIndicator} ${styles.visible}${
            fast ? ` ${styles.scrolling}` : ""
          }`}
        >
          {(topIndex + 1).toLocaleString()} /{" "}
          {layout.totalCount.toLocaleString()}
        </div>
      )}
    </div>
  );
}
